import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import {
  ASSET_IMPORT_ACCEPT,
  BUILTIN_ASSET_IDS,
  addDefaultDocumentAsset,
  applyExternalStoreInstall,
  applyOpenBrushCatalogInstall,
  applyComponentCodeImportPlan,
  applyClassicProjectVisualImportEnhancements,
  analyzeComponentCode,
  prepareClassicProjectVisualAssetImports,
  addDefaultParticleAsset,
  analyzeAssetDeletion,
  analyzeAssetFolderDeletion,
  autoFitBoxCollider,
  commitAssetImportPlanToDisk,
  commitAssetImportPlansToDisk,
  createAssetImportPlan,
  sha256AssetBytes,
  createUnityPackageImportPlan,
  addEditorComponent,
  addAssetFolder,
  addPrefabAsset,
  addBuiltinPrimitiveEntity,
  assignMaterialToMeshSlots,
  commitEditorHistory,
  createEditorHistory,
  createDocumentId,
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
  getEditorComponentMenuDefinitions,
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
  renameAsset,
  renameAssetFolder,
  renameEntity,
  resolvePrefabInstances,
  resolveEditorCommands,
  executeXriftMcpEditorTool,
  extractScriptContract,
  XRIFT_MCP_EDITOR_TOOLS,
  XRIFT_MCP_LOCAL_ASSET_TOOLS,
  XRIFT_MCP_SCRIPT_TOOLS,
  STUDIO_IMAGE_EXTENSION_PATTERN,
  THREE_EDITOR_MODEL_EXTENSION_PATTERN,
  XriftMcpEditorToolError,
  type ScriptContract,
  type XriftMcpScriptToolName,
  shortcutForCommand,
  synchronizePlaySession,
  redoEditorHistory,
  replaceEditorHistoryPresent,
  reparentEntityHierarchy,
  reimportModelAssetFromDisk,
  undoEditorHistory,
  updateEntityEnabled,
  updateModelNodeEntityTransform,
  updateAnimationComponent,
  updateAudioSourceComponent,
  updateColliderComponent,
  optimizeColliderConfiguration,
  updateRigidBodyComponent,
  updateLightComponent,
  updateTextComponent,
  updateMeshShadowSettings,
  updateMaterialAsset,
  updateAssetThumbnail,
  updateModelAsset,
  updateParticleAsset,
  updatePrefabDocumentFromSource,
  updateTextureAsset,
  updateInteractivityAsset,
  updateXriftComponent,
  type ColliderPatch,
  type RigidBodyPatch,
  type ComponentCodeImportPlan,
  type ClassicProjectVisualImportPreview,
  type ClassicProjectVisualImportSource,
  type AnimationPatch,
  type AssetManifest,
  type AudioSourcePatch,
  type LightPatch,
  type MaterialAssetPatch,
  type AssetThumbnailDescriptor,
  type ModelAssetPatch,
  type ModelReimportProgress,
  type OpenBrushCatalogEntry,
  type EditorCommandId,
  type EntityClipboard,
  type ParticlePropertiesPatch,
  type PlaySession,
  type PrototypeVisualProject,
  type SceneSettings,
  type ScriptAsset,
  type ShaderAssetStage,
  type SceneDocument,
  type TextureAssetPatch,
  type TextPatch,
  type TransformPatch,
  type UpdateXriftComponentPatch,
  type Vec3,
  type VisualProjectKind,
  type KhrInteractivityExtension,
  type XriftMcpEditorToolName,
  type XriftMcpLocalAssetToolName,
  type XriftComponentDefinition,
  mcpTextureImportSettingsPatch,
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
import { setProjectThumbnailFromAsset } from "../../lib/project-thumbnail";
import { AssetsPanel } from "./AssetsPanel";
import { EnvironmentTextureThumbnailGenerationQueue } from "./EnvironmentTextureThumbnailGenerationQueue";
import { MaterialThumbnailGenerationQueue } from "./MaterialThumbnailGenerationQueue";
import { ExternalAssetStoreDialog } from "./ExternalAssetStoreDialog";
import {
  hasActiveAssetImport,
  resolveAssetOperationAvailability,
} from "./asset-operation-lock";
import {
  createSerializedAutosaveCoordinator,
  type SerializedAutosaveCoordinator,
} from "./autosave-coordinator";
import {
  AssetDeleteDialog,
  type AssetDeleteDialogTarget,
} from "./AssetDeleteDialog";
import { EditorCreateMenu } from "./EditorCreateMenu";
import { EditorImportMenu } from "./EditorImportMenu";
import { ComponentCodeImportDialog } from "./ComponentCodeImportDialog";
import { InteractivityGraphEditor } from "./InteractivityGraphEditor";
import { EditorUtilityRail } from "./EditorUtilityRail";
import type { XriftMcpActivity } from "./AiConnectionPanel";
import { commandTitle, EDITOR_ICONS } from "./editor-icons";
import { HierarchyPanel } from "./HierarchyPanel";
import {
  ALL_MATERIAL_SLOTS,
  MaterialSlotAssignmentDialog,
  type MaterialSlotAssignmentOption,
} from "./MaterialSlotAssignmentDialog";
import type { ModelReimportState } from "./ModelAssetInspector";
import {
  InspectorPanel,
  type MeshInspectorPatch,
  type ParticleEmitterInspectorPatch,
} from "./InspectorPanel";
import {
  SceneViewport,
  type SceneFocusState,
} from "./SceneViewport";
import type { ScriptViewportRuntime } from "./EntityScriptVisual";
import type { ScriptComponentPatch } from "./ScriptComponentInspector";
import {
  useScriptRuntime,
  type ScriptCompileError,
} from "./useScriptRuntime";
import { useScriptEditor } from "./useScriptEditor";
import { ScriptEditorDialog } from "./ScriptEditorDialog";
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
  createScriptTrustFingerprint,
  describeScriptProvenance,
  normalizeScriptProvenance,
  type ScriptExecutionFingerprint,
  type ScriptProvenanceDto,
  type ScriptSourceSnapshot,
} from "../../lib/visual-editor/scripting/script-trust";
import {
  ScriptTrustDialog,
  createScriptTrustSnapshotKey,
  type ScriptTrustDialogResult,
} from "./ScriptTrustDialog";
import { roundTo } from "./editor-utils";
import type {
  EditorMode,
  EditorSelection,
  PendingImport,
  TransformMode,
  TransformSpace,
} from "./types";

const SUPPORTED_MODEL_FILE = THREE_EDITOR_MODEL_EXTENSION_PATTERN;
const SUPPORTED_TEXTURE_FILE = STUDIO_IMAGE_EXTENSION_PATTERN;
const SUPPORTED_HDRI_FILE = /\.(hdr|exr)$/i;
const XRIFT_MCP_EXTERNAL_STORE_TOOLS = [
  "search_external_assets",
  "get_external_asset_options",
  "install_external_asset",
] as const;
type XriftMcpExternalStoreTool = (typeof XRIFT_MCP_EXTERNAL_STORE_TOOLS)[number];
const SUPPORTED_AUDIO_FILE = /\.(?:mp3|wav)$/i;
const SUPPORTED_SHADER_FILE = /\.(?:glsl|vert|vertex|vs|frag|fragment|fs)$/i;
const SUPPORTED_UNITY_FILE = /\.(unitypackage|unity|prefab)$/i;
const AUTOSAVE_DELAY_MS = 250;
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
};

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

export type VisualEditorLayout = {
  hierarchyWidth: number;
  inspectorWidth: number;
  assetsHeight: number;
};

const DEFAULT_EDITOR_LAYOUT: VisualEditorLayout = {
  hierarchyWidth: 185,
  inspectorWidth: 320,
  assetsHeight: 220,
};

const EDITOR_LAYOUT_STORAGE_KEY = "xrift-studio.visual-editor.layout.v1";

function clampEditorLayout(
  candidate: Partial<VisualEditorLayout>,
): VisualEditorLayout {
  const numeric = (
    value: number | undefined,
    fallback: number,
    min: number,
    max: number,
  ) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(min, Math.min(max, value))
      : fallback;
  return {
    hierarchyWidth: numeric(
      candidate.hierarchyWidth,
      DEFAULT_EDITOR_LAYOUT.hierarchyWidth,
      150,
      280,
    ),
    inspectorWidth: numeric(
      candidate.inspectorWidth,
      DEFAULT_EDITOR_LAYOUT.inspectorWidth,
      280,
      460,
    ),
    assetsHeight: numeric(
      candidate.assetsHeight,
      DEFAULT_EDITOR_LAYOUT.assetsHeight,
      160,
      340,
    ),
  };
}

function loadEditorLayout(
  preferred?: Partial<VisualEditorLayout>,
): VisualEditorLayout {
  if (preferred) return clampEditorLayout(preferred);
  if (typeof window === "undefined") return DEFAULT_EDITOR_LAYOUT;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(EDITOR_LAYOUT_STORAGE_KEY) ?? "null",
    ) as Partial<VisualEditorLayout> | null;
    return parsed ? clampEditorLayout(parsed) : DEFAULT_EDITOR_LAYOUT;
  } catch {
    return DEFAULT_EDITOR_LAYOUT;
  }
}

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

function mcpRequiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      `${name}は空でない文字列で指定してください`,
    );
  }
  return value.trim();
}

function mcpOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function mcpOptionalScriptLanguage(
  value: unknown,
): "ts" | "tsx" | undefined {
  if (value === undefined) return undefined;
  if (value === "ts" || value === "tsx") return value;
  throw new XriftMcpEditorToolError(
    "INVALID_ARGUMENT",
    "languageはtsまたはtsxで指定してください",
  );
}

function mcpOptionalInteger(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      `${name}は0以上の整数で指定してください`,
    );
  }
  return value;
}

function assertMcpExternalStoreWrite(
  argumentsValue: Record<string, unknown>,
  context: {
    bundle: PrototypeVisualProject;
    editorMode: EditorMode;
    importBusy: boolean;
    revision: number;
  },
  options: { allowPlay?: boolean } = {},
): void {
  if (context.editorMode !== "edit" && !options.allowPlay) {
    throw new XriftMcpEditorToolError(
      "EDITOR_READ_ONLY",
      "Playを停止してから外部アセットを追加してください",
    );
  }
  if (context.importBusy) {
    throw new XriftMcpEditorToolError(
      "EDITOR_BUSY",
      "Asset Importの完了後に再試行してください",
    );
  }
  const projectId = mcpRequiredString(argumentsValue.projectId, "projectId");
  const sceneId = mcpRequiredString(argumentsValue.sceneId, "sceneId");
  const expectedRevision = mcpOptionalInteger(
    argumentsValue.expectedRevision,
    "expectedRevision",
  );
  if (expectedRevision === undefined) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      "expectedRevisionを指定してください",
    );
  }
  if (projectId !== context.bundle.project.projectId) {
    throw new XriftMcpEditorToolError("PROJECT_MISMATCH", "現在のProjectと一致しません");
  }
  if (sceneId !== context.bundle.scene.sceneId) {
    throw new XriftMcpEditorToolError("SCENE_MISMATCH", "現在のSceneと一致しません");
  }
  if (expectedRevision !== context.revision) {
    throw new XriftMcpEditorToolError(
      "STALE_REVISION",
      "Sceneが更新されています。最新のEditor contextを取得してください",
      { expectedRevision, currentRevision: context.revision },
    );
  }
  if (
    argumentsValue.applySkybox !== undefined &&
    typeof argumentsValue.applySkybox !== "boolean"
  ) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      "applySkyboxはbooleanで指定してください",
    );
  }
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
  /** Only direct Studio interaction may open the approval dialog. */
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

type ScriptTrustPromptState = {
  snapshots: readonly ScriptSourceSnapshot[];
};

type ScriptExecutionScopeInput = {
  projectId: string;
  projectPath: string | null;
};

type ResolvedScriptExecutionScope = ScriptExecutionScopeInput & {
  canonicalProjectPath: string;
};

function sameScriptExecutionScopeInput(
  left: ScriptExecutionScopeInput,
  right: ScriptExecutionScopeInput,
): boolean {
  return (
    left.projectId === right.projectId &&
    left.projectPath === right.projectPath
  );
}

function sameResolvedScriptExecutionScope(
  left: ResolvedScriptExecutionScope,
  right: ResolvedScriptExecutionScope,
): boolean {
  return (
    sameScriptExecutionScopeInput(left, right) &&
    left.canonicalProjectPath === right.canonicalProjectPath
  );
}

function scriptTrustFingerprintKey(
  fingerprint: ScriptExecutionFingerprint,
): string {
  return JSON.stringify([
    fingerprint.sourceSha256,
    fingerprint.language,
    fingerprint.contractVersion,
    fingerprint.modulePolicyVersion,
    fingerprint.allowRemoteModules,
  ]);
}

function approvalRequiredSnapshots(
  errors: readonly ScriptCompileError[],
): ScriptSourceSnapshot[] {
  const snapshots = new Map<string, ScriptSourceSnapshot>();
  for (const error of errors) {
    if (
      error.code === "SCRIPT_APPROVAL_REQUIRED" &&
      error.trustSnapshot
    ) {
      snapshots.set(error.trustSnapshot.snapshotKey, error.trustSnapshot);
    }
  }
  return [...snapshots.values()];
}

function blockingScriptCompileErrors(
  errors: readonly ScriptCompileError[],
): ScriptCompileError[] {
  return errors.filter(
    (error) => error.code !== "SCRIPT_APPROVAL_REQUIRED",
  );
}

function scriptCompileErrorsForMcp(
  errors: readonly ScriptCompileError[],
): Array<Record<string, unknown>> {
  return errors.map((error) => ({
    assetId: error.assetId,
    assetName: error.assetName,
    relativePath: error.relativePath,
    message: error.message,
    ...(error.code ? { code: error.code } : {}),
    ...(error.trustSnapshot
      ? {
          sourceSha256:
            error.trustSnapshot.fingerprint.sourceSha256,
        }
      : {}),
  }));
}

/** requestAnimationFrame pauses in a hidden Tauri webview, but MCP must reply. */
function waitForEditorCommit(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(fallback);
      resolve();
    };
    const fallback = window.setTimeout(finish, 100);
    window.requestAnimationFrame(finish);
  });
}

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

export function VisualEditorPrototype({
  projectKind,
  onBack,
  backLabel = "ライブラリ",
  projectName,
  projectPath,
  initialBundle: providedInitialBundle,
  onSave,
  onUpload,
  onClassicExport,
  compilationFresh = false,
  onThumbnailChanged,
  thumbnailCaptureRequest = 0,
  onThumbnailCaptured,
  onThumbnailCaptureError,
  initialLayout,
  onLayoutChange,
}: VisualEditorPrototypeProps) {
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
  const [history, setHistory] = useState(() =>
    createEditorHistory(createInitialSnapshot(), 80),
  );
  const bundle = history.present.bundle;
  const bundleRef = useRef(bundle);
  bundleRef.current = bundle;
  const mcpRevisionRef = useRef(0);
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
  const resolvedScriptExecutionScopeRef =
    useRef<ResolvedScriptExecutionScope | null>(null);
  const invalidateScriptExecutionScopeRef = useRef<() => void>(() => {
    playPreparationGenerationRef.current += 1;
    playPreparationActiveRef.current = false;
    activePlayUnapprovedPolicyRef.current = "block";
    resolvedScriptExecutionScopeRef.current = null;
  });
  if (
    observedScriptExecutionScopeInputKeyRef.current !==
    scriptExecutionScopeInputKey
  ) {
    observedScriptExecutionScopeInputKeyRef.current =
      scriptExecutionScopeInputKey;
    playPreparationGenerationRef.current += 1;
    playPreparationActiveRef.current = false;
    activePlayUnapprovedPolicyRef.current = "block";
    resolvedScriptExecutionScopeRef.current = null;
  }
  // A project switch is first observed during render, while the cleanup
  // effect runs after commit. Never expose the previous project's compiled
  // modules or Play copy during that intervening render.
  const scriptExecutionScopeRenderCurrent =
    resetScriptExecutionScopeInputKeyRef.current ===
    scriptExecutionScopeInputKey;
  scriptExecutionScopeInputRef.current = scriptExecutionScopeInput;
  const acceptResolvedScriptExecutionScope = useCallback(
    (
      requested: ScriptExecutionScopeInput,
      canonicalProjectPath: string,
    ): boolean => {
      if (
        !sameScriptExecutionScopeInput(
          requested,
          scriptExecutionScopeInputRef.current,
        )
      ) {
        invalidateScriptExecutionScopeRef.current();
        return false;
      }
      const resolved: ResolvedScriptExecutionScope = {
        ...requested,
        canonicalProjectPath,
      };
      const previous = resolvedScriptExecutionScopeRef.current;
      if (previous && !sameResolvedScriptExecutionScope(previous, resolved)) {
        invalidateScriptExecutionScopeRef.current();
        return false;
      }
      resolvedScriptExecutionScopeRef.current = resolved;
      return true;
    },
    [],
  );
  const scriptProvenanceRef = useRef(
    new Map<string, ScriptProvenanceDto>(),
  );
  const resolveScriptProvenance = useCallback(
    (assetId: string): ScriptProvenanceDto =>
      scriptProvenanceRef.current.get(assetId) ??
      normalizeScriptProvenance({ kind: "filesystem", detail: null }),
    [],
  );
  const checkScriptTrust = useCallback(
    async (snapshots: readonly ScriptSourceSnapshot[]) => {
      if (!projectPath || snapshots.length === 0) {
        return { approvedSnapshotKeys: new Set<string>() };
      }
      const requestedScope: ScriptExecutionScopeInput = {
        projectId: bundle.project.projectId,
        projectPath,
      };
      const status = await tauri.getScriptTrustStatus(
        {
          projectPath,
          projectId: bundle.project.projectId,
        },
        snapshots.map((snapshot) => snapshot.fingerprint),
      );
      if (
        status.project.projectId !== requestedScope.projectId ||
        !acceptResolvedScriptExecutionScope(
          requestedScope,
          status.project.canonicalProjectPath,
        )
      ) {
        throw new Error(
          "Script execution scope changed while checking approvals",
        );
      }
      const approvedFingerprints = new Set(
        status.checks
          .filter((check) => check.approved)
          .map((check) => scriptTrustFingerprintKey(check.fingerprint)),
      );
      return {
        approvedSnapshotKeys: new Set(
          snapshots
            .filter((snapshot) =>
              approvedFingerprints.has(
                scriptTrustFingerprintKey(snapshot.fingerprint),
              ),
            )
            .map((snapshot) => snapshot.snapshotKey),
        ),
      };
    },
    [
      acceptResolvedScriptExecutionScope,
      bundle.project.projectId,
      projectPath,
    ],
  );
  const approveScriptFingerprintsForUi = useCallback(
    async (
      snapshots: readonly Pick<ScriptSourceSnapshot, "fingerprint">[],
    ): Promise<void> => {
      if (!projectPath || snapshots.length === 0) return;
      const requestedScope: ScriptExecutionScopeInput = {
        projectId: bundle.project.projectId,
        projectPath,
      };
      const result = await tauri.approveScriptTrustFingerprintsForUi(
        {
          projectPath,
          projectId: bundle.project.projectId,
        },
        snapshots.map((snapshot) => snapshot.fingerprint),
      );
      if (
        result.project.projectId !== requestedScope.projectId ||
        !acceptResolvedScriptExecutionScope(
          requestedScope,
          result.project.canonicalProjectPath,
        )
      ) {
        throw new Error(
          "Script execution scope changed while recording approval",
        );
      }
    },
    [
      acceptResolvedScriptExecutionScope,
      bundle.project.projectId,
      projectPath,
    ],
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
    checkScriptTrust,
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
        throw new Error("同じScript fileを保存中です。完了後に再試行してください");
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
  const approveExactScriptSourceForUi = useCallback(
    async (
      asset: ScriptAsset,
      source: string,
      provenance: ScriptProvenanceDto,
    ): Promise<void> => {
      const fingerprint = await createScriptTrustFingerprint({
        source,
        language: asset.language,
        contractVersion: asset.contractVersion,
        allowRemoteModules: false,
      });
      await approveScriptFingerprintsForUi([{ fingerprint }]);
      scriptProvenanceRef.current.set(asset.id, provenance);
    },
    [approveScriptFingerprintsForUi],
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
    onSaved: async (assetId, source) => {
      scriptSourceRevisionRef.current += 1;
      // Script source is outside the document bundle, but it is still part of
      // the MCP optimistic-concurrency boundary.
      mcpRevisionRef.current += 1;
      const asset = bundleRef.current.assets.assets[assetId];
      if (asset?.kind === "script") {
        try {
          await approveExactScriptSourceForUi(
            asset,
            source,
            normalizeScriptProvenance({
              kind: "studio-editor",
              detail: null,
            }),
          );
        } catch {
          // The source remains saved, but the trust gate fails closed. The
          // next Play/hot reload shows the explicit approval flow.
          setNotice(
            "Scriptは保存しましたが、実行許可を記録できませんでした。Play時に内容を確認してください",
          );
        }
      }
      if (playingRef.current) {
        const runtimeErrors = await scriptRuntime.compile({
          unapprovedPolicy: activePlayUnapprovedPolicyRef.current,
        });
        const blockingErrors =
          blockingScriptCompileErrors(runtimeErrors);
        const pendingApproval =
          approvalRequiredSnapshots(runtimeErrors);
        if (blockingErrors.length > 0) {
          setNotice(
            `Scriptを更新できません: ${blockingErrors[0]?.assetName ?? ""} ${blockingErrors[0]?.message ?? ""}`,
          );
        } else if (pendingApproval.length > 0) {
          setNotice(
            "保存したScriptは未承認のため、前回の正常な内容を実行したままにしています",
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
  const scriptEditorDirtyRef = useRef(false);
  const handleScriptEditorDirtyChange = useCallback((dirty: boolean) => {
    scriptEditorDirtyRef.current = dirty;
  }, []);
  const scriptEditorOpenAssetIdRef = useRef(
    scriptEditor.state.openAssetId,
  );
  scriptEditorOpenAssetIdRef.current = scriptEditor.state.openAssetId;
  const openScriptEditor = useCallback(
    async (assetId: string, createdAsset?: ScriptAsset): Promise<boolean> => {
      const currentAssetId = scriptEditorOpenAssetIdRef.current;
      if (
        scriptEditorDirtyRef.current &&
        currentAssetId !== null &&
        currentAssetId !== assetId
      ) {
        const discard = window.confirm(
          "編集中のScriptに保存していない変更があります。破棄して別のScriptを開きますか。",
        );
        if (!discard) return false;
        scriptEditorDirtyRef.current = false;
      }
      await scriptEditor.open(assetId, createdAsset);
      return true;
    },
    [scriptEditor.open],
  );
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
  const [scriptTrustPrompt, setScriptTrustPrompt] =
    useState<ScriptTrustPromptState | null>(null);
  const scriptTrustPromptResolveRef = useRef<
    ((result: ScriptTrustDialogResult) => void) | null
  >(null);
  const requestScriptTrustDecision = useCallback(
    (snapshots: readonly ScriptSourceSnapshot[]) =>
      new Promise<ScriptTrustDialogResult>((resolve) => {
        scriptTrustPromptResolveRef.current?.({
          decision: "cancel",
          snapshotKey: createScriptTrustSnapshotKey(
            scriptTrustPrompt?.snapshots.map((snapshot) => ({
              id: snapshot.assetId,
              hash: snapshot.fingerprint.sourceSha256,
            })) ?? [],
          ),
        });
        scriptTrustPromptResolveRef.current = resolve;
        setScriptTrustPrompt({ snapshots });
      }),
    [scriptTrustPrompt?.snapshots],
  );
  const resolveScriptTrustPrompt = useCallback(
    (result: ScriptTrustDialogResult) => {
      const resolve = scriptTrustPromptResolveRef.current;
      scriptTrustPromptResolveRef.current = null;
      setScriptTrustPrompt(null);
      resolve?.(result);
    },
    [],
  );
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [scriptTemplateFolderId, setScriptTemplateFolderId] = useState<
    string | null | undefined
  >(undefined);
  const [componentImportOpen, setComponentImportOpen] = useState(false);
  const [componentImportBusy, setComponentImportBusy] = useState(false);
  const [mcpLocalAssetImportBusy, setMcpLocalAssetImportBusy] = useState(false);
  const [sceneSettingsOpen, setSceneSettingsOpen] = useState(false);
  const [externalStoreOpen, setExternalStoreOpen] = useState(false);
  const [interactivityEditorAssetId, setInteractivityEditorAssetId] =
    useState<string | null>(null);
  const [pendingImports, setPendingImports] = useState<QueuedAssetImport[]>([]);
  const importQueueRef = useRef<QueuedAssetImport[]>([]);
  const importRunningRef = useRef(false);
  const assetOperationRef = useRef<{
    kind: "asset-import" | "model-reimport";
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
          `${failure.scriptName} を ${failure.phase} エラーで停止しました。Scriptを開いてConsoleを確認してください: ${failure.message}`,
        );
      }
    }
    noticedScriptFailureRevisionRef.current =
      scriptRuntimeReport.failureRevision;
  }, [scriptRuntimeReport.failureRevision, scriptRuntimeReport.failures]);
  const [leaving, setLeaving] = useState(false);
  const mcpNativeAvailable = tauri.isAvailable();
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
        const pendingApproval = approvalRequiredSnapshots(errors);
        setNotice(
          blockingErrors.length > 0
            ? `Scriptを更新できません: ${blockingErrors[0]?.assetName ?? ""} ${blockingErrors[0]?.message ?? ""}`
            : `${pendingApproval.length}件の未承認Scriptは実行せず、前回の正常な内容を維持しています`,
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
        "AI clientまたはOllamaを確認できませんでした。XRift Studioを再起動して再試行してください",
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
          `${status.label}へXRift Studioを登録しました。clientを再起動すると利用できます`,
        );
      } catch (error) {
        setMcpError(
          typeof error === "string" && error.trim()
            ? error
            : "AI clientへ登録できませんでした。clientのinstall状態を確認してください",
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
          "構成先のAI clientが見つかりません。先にclientをinstallしてください",
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
          `${result.integrationLabel}をOllamaの${result.model}で構成しました。clientを起動または再起動してください`,
        );
      } catch (error) {
        setOllamaError(
          typeof error === "string" && error.trim()
            ? error
            : "OllamaでAI clientを構成できませんでした。Ollamaとclientの状態を確認してください",
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
          setNotice(
            error instanceof Error ? error.message : "自動保存に失敗しました",
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
        return commitEditorHistory(current, {
          ...current.present,
          bundle: nextBundle,
        });
      });
    },
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
        setNotice("GLSLを保存し、参照中のMaterialへ反映しました");
        return touchProject({
          ...current,
          assets: { ...current.assets, assets: nextAssets },
        });
      });
    },
    [setBundle],
  );
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
    scriptTrustPromptResolveRef.current?.({
      decision: "cancel",
      snapshotKey: createScriptTrustSnapshotKey([]),
    });
    scriptTrustPromptResolveRef.current = null;
    setScriptTrustPrompt(null);
    scriptProvenanceRef.current.clear();
    clipboardRef.current = null;
    transformScrubRef.current = null;
    setRenameTarget(null);
    setDeleteDialog(null);
    setPendingMaterialAssignment(null);
    setModelReimportFeedback(null);
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
      if (transformScrubRef.current) return;
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
  const importBusy =
    componentImportBusy ||
    mcpLocalAssetImportBusy ||
    modelReimportBusy ||
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
    resolvedScriptExecutionScopeRef.current = null;
    preparedScriptRuntimeInputKeyRef.current = null;
    scriptTrustPromptResolveRef.current?.({
      decision: "cancel",
      snapshotKey: createScriptTrustSnapshotKey([]),
    });
    scriptTrustPromptResolveRef.current = null;
    setScriptTrustPrompt(null);
    scriptProvenanceRef.current.clear();
    setPlaySession(null);
    setEditorMode("edit");
    setPlayPreparing(false);
    scriptRuntime.reset();
    setNotice(
      "Projectの実行範囲が変わったためPlay準備を中止しました。現在のProjectで改めてPlayしてください",
    );
  }, [scriptExecutionScopeInputKey, scriptRuntime.reset]);
  invalidateScriptExecutionScopeRef.current =
    invalidateScriptExecutionScope;
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

  useEffect(() => {
    if (!mcpNativeAvailable) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let heartbeat: number | undefined;

    const complete = async (
      request: XriftMcpEditorRequestEvent,
    ): Promise<void> => {
      try {
        const localAssetTool = XRIFT_MCP_LOCAL_ASSET_TOOLS.includes(
          request.tool as XriftMcpLocalAssetToolName,
        );
        const externalStoreTool = XRIFT_MCP_EXTERNAL_STORE_TOOLS.includes(
          request.tool as XriftMcpExternalStoreTool,
        );
        const scriptTool = XRIFT_MCP_SCRIPT_TOOLS.includes(
          request.tool as XriftMcpScriptToolName,
        );
        if (
          !localAssetTool &&
          !externalStoreTool &&
          !scriptTool &&
          !XRIFT_MCP_EDITOR_TOOLS.includes(
            request.tool as XriftMcpEditorToolName,
          )
        ) {
          throw new XriftMcpEditorToolError(
            "TOOL_NOT_FOUND",
            "対応していないAI editor toolです",
          );
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
              "Shaderを追加する前にProjectを保存してください",
            );
          }
          if (importRunningRef.current || assetOperationRef.current !== null) {
            throw new XriftMcpEditorToolError(
              "EDITOR_BUSY",
              "別のAsset操作の完了後にShader Importを再試行してください",
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
              "作成先のFolderが見つかりません",
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
                "ローカルShaderを読み取れませんでした。絶対パス、GLSL拡張子、通常ファイル、8MiB上限を確認してください",
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
              await tauri.completeXriftMcpRequest({
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
                "Shader検証中に作成先Folderが更新されました。最新のEditor contextで再試行してください",
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
            const activity = `AIがShader「${shader.name}」をインポートしました`;
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
            await tauri.completeXriftMcpRequest({
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
                "指定されたShader Assetが見つかりません",
                { shaderAssetId },
              );
            }
            if (!currentProjectPath) {
              throw new XriftMcpEditorToolError(
                "PROJECT_NOT_SAVED",
                "Shaderを読み取る前にProjectを保存してください",
              );
            }
            const source = await tauri.readTextFile(
              currentProjectPath,
              shader.source.relativePath,
            );
            await tauri.completeXriftMcpRequest({
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
              "このMCP操作の前にProjectを保存してください",
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
                "サムネイルにはTexture Assetを指定してください",
                { assetId },
              );
            }
            await setProjectThumbnailFromAsset(currentProjectPath, asset);
            await tauri.completeXriftMcpRequest({
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
                "Modelを再インポートする前にProjectを保存してください",
              );
            }
            const model = sourceBundle.assets.assets[modelAssetId];
            if (!model || model.kind !== "model") {
              throw new XriftMcpEditorToolError(
                "MODEL_NOT_FOUND",
                "指定されたModel Assetが見つかりません",
                { modelAssetId },
              );
            }
            if (
              importRunningRef.current ||
              assetOperationRef.current !== null
            ) {
              throw new XriftMcpEditorToolError(
                "EDITOR_BUSY",
                "別のAsset操作の完了後にModel再インポートを再試行してください",
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
                  "Model再インポート中にProjectが更新されました。最新のEditor contextで再試行してください",
                  { modelAssetId },
                );
              }
              const nextBundle = touchProject({
                ...latestBundle,
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
              setModelReimportFeedback({
                assetId: modelAssetId,
                state: {
                  phase: "succeeded",
                  message: "Modelを再インポートしました。変更を自動保存します",
                },
              });
              const activity = `AIがModel「${model.name}」を再インポートしました`;
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
              await tauri.completeXriftMcpRequest({
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

          const shaderAssetId = mcpRequiredString(
            args.shaderAssetId,
            "shaderAssetId",
          );
          const shader = sourceBundle.assets.assets[shaderAssetId];
          if (!shader || shader.kind !== "shader") {
            throw new XriftMcpEditorToolError(
              "SHADER_NOT_FOUND",
              "指定されたShader Assetが見つかりません",
              { shaderAssetId },
            );
          }
          if (typeof args.source !== "string" || !args.source.trim()) {
            throw new XriftMcpEditorToolError(
              "INVALID_ARGUMENT",
              "sourceは空でない文字列で指定してください",
            );
          }
          if (new TextEncoder().encode(args.source).byteLength > 8 * 1024 * 1024) {
            throw new XriftMcpEditorToolError(
              "INVALID_ARGUMENT",
              "sourceは8MiB以内で指定してください",
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
              "Shader保存中にAssetが更新されました。最新のEditor contextで再試行してください",
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
          const activity = `AIがShader「${shader.name}」を更新しました`;
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
          await tauri.completeXriftMcpRequest({
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
          const isModelImport = request.tool === "import_model_asset";
          const isSkyboxImport = request.tool === "import_skybox_asset";
          const importedKind = isAudioImport
            ? "audio"
            : isModelImport
              ? "model"
              : "texture";
          const expectedClassificationKind = isSkyboxImport
            ? "skybox"
            : importedKind;
          const assetLabel = isAudioImport
            ? "Audio"
            : isModelImport
              ? "Model"
              : isSkyboxImport
                ? "HDRI"
                : "Texture";
          const sourceRejectedCode = isAudioImport
            ? "AUDIO_SOURCE_REJECTED"
            : isModelImport
              ? "MODEL_SOURCE_REJECTED"
              : isSkyboxImport
                ? "SKYBOX_SOURCE_REJECTED"
                : "TEXTURE_SOURCE_REJECTED";
          const importRejectedCode = isAudioImport
            ? "AUDIO_IMPORT_REJECTED"
            : isModelImport
              ? "MODEL_IMPORT_REJECTED"
              : isSkyboxImport
                ? "SKYBOX_IMPORT_REJECTED"
                : "TEXTURE_IMPORT_REJECTED";
          const importFailedCode = isAudioImport
            ? "AUDIO_IMPORT_FAILED"
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
              `別のAsset操作の完了後に${assetLabel} Importを再試行してください`,
            );
          }
          const currentProjectPath = projectPathRef.current;
          if (!currentProjectPath) {
            throw new XriftMcpEditorToolError(
              "PROJECT_NOT_SAVED",
              `${assetLabel}を追加する前にProjectを保存してください`,
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
              "作成先のFolderが見つかりません",
              { folderId },
            );
          }
          const importSettings = isAudioImport || isModelImport || isSkyboxImport
            ? undefined
            : mcpTextureImportSettingsPatch(
                args.importSettings ?? {},
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
                    preferredKind: "texture" as const,
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
                `${assetLabel}検証中に作成先Folderが更新されました。最新のEditor contextで再試行してください`,
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
              await tauri.completeXriftMcpRequest({
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
            await tauri.completeXriftMcpRequest({
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
            await tauri.completeXriftMcpRequest({
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
              "Scriptを操作する前にProjectを保存してください",
            );
          }
          if (request.tool === "get_script_asset") {
            const assetId = mcpRequiredString(args.scriptAssetId, "scriptAssetId");
            const asset = sourceBundle.assets.assets[assetId];
            if (!asset || asset.kind !== "script") {
              throw new XriftMcpEditorToolError(
                "SCRIPT_NOT_FOUND",
                "指定されたScript Assetが見つかりません",
                { scriptAssetId: assetId },
              );
            }
            const source = await tauri.readTextFile(
              currentProjectPath,
              asset.source.relativePath,
            );
            await tauri.completeXriftMcpRequest({
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
                "unapprovedPolicyはPlay開始時にskipだけ指定できます",
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
            if (playStartFailure === "approval-required") {
              throw new XriftMcpEditorToolError(
                "SCRIPT_APPROVAL_REQUIRED",
                "未承認のScriptがあるためPlayを開始しません。Studio UIで内容を確認するか、unapprovedPolicy:'skip'を明示してください",
                {
                  scripts: (playResult?.approvalRequired ?? []).map(
                    (snapshot) => ({
                      scriptAssetId: snapshot.assetId,
                      name: snapshot.name,
                      relativePath: snapshot.path,
                      language: snapshot.language,
                      sourceSha256: snapshot.fingerprint.sourceSha256,
                      provenance: describeScriptProvenance(
                        snapshot.provenance,
                      ),
                    }),
                  ),
                },
              );
            }
            if (playStartFailure === "compile-failed") {
              const blockingErrors = blockingScriptCompileErrors(
                playResult?.errors ?? [],
              );
              throw new XriftMcpEditorToolError(
                "SCRIPT_COMPILE_FAILED",
                `Scriptを変換できないためPlayを開始しません: ${blockingErrors[0]?.assetName ?? ""} ${blockingErrors[0]?.message ?? ""}`.trim(),
                {
                  compileErrors:
                    scriptCompileErrorsForMcp(blockingErrors),
                },
              );
            }
            if (editorModeRef.current !== mode) {
              throw new XriftMcpEditorToolError(
                "PLAY_MODE_CHANGE_FAILED",
                mode === "play"
                  ? "Scriptの変換またはPlay初期化に失敗しました。Editorの通知を確認してください"
                  : "Playを停止できませんでした。もう一度実行してください",
                { requestedMode: mode, currentMode: editorModeRef.current },
              );
            }
            await tauri.completeXriftMcpRequest({
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
                "指定されたScript Templateが見つかりません",
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
                "作成先のFolderが見つかりません",
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
                "指定されたScript Templateを生成できません",
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
                "Script Componentを指定されたEntityへ追加できません",
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
                "Script作成中にEntityまたはFolderが更新されました。最新のEditor contextで再試行してください",
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
            await tauri.completeXriftMcpRequest({
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
                "templateIdとsourceは同時に指定できません",
              );
            }
            if (args.source !== undefined && typeof args.source !== "string") {
              throw new XriftMcpEditorToolError(
                "INVALID_ARGUMENT",
                "sourceは文字列で指定してください",
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
                "指定されたScript Templateが見つかりません",
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
                `Template ${template.id} は${template.language} Scriptです`,
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
                "作成先のFolderが見つかりません",
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
            activity = `AIが「${name}」をScript Assetとして作成しました`;
          } else {
            const assetId = mcpRequiredString(args.scriptAssetId, "scriptAssetId");
            const candidate = sourceBundle.assets.assets[assetId];
            if (!candidate || candidate.kind !== "script") {
              throw new XriftMcpEditorToolError(
                "SCRIPT_NOT_FOUND",
                "指定されたScript Assetが見つかりません",
                { scriptAssetId: assetId },
              );
            }
            if (
              scriptEditorDirtyRef.current &&
              scriptEditorOpenAssetIdRef.current === candidate.id
            ) {
              throw new XriftMcpEditorToolError(
                "EDITOR_BUSY",
                "このScriptにはEditorで保存していない変更があります。保存または破棄してから再試行してください",
                { scriptAssetId: candidate.id },
              );
            }
            const source =
              typeof args.source === "string"
                ? args.source
                : (() => {
                    throw new XriftMcpEditorToolError(
                      "INVALID_ARGUMENT",
                      "sourceは文字列で指定してください",
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
                "同じScript fileを保存中です。完了後に再試行してください",
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
            activity = `AIが「${candidate.name}」のScript sourceを更新しました`;
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
                "Script作成中にAssetsまたはFolderが更新されました。最新のEditor contextで再試行してください",
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
                "Script保存中にAssetが更新されました。最新のEditor contextで再試行してください",
                { scriptAssetId: asset.id },
              );
            }
            asset = latestCandidate;
            activity = `AIが「${latestCandidate.name}」のScript sourceを更新しました`;
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
                blockingErrors.length > 0
                  ? `「${asset.name}」は保存しましたが、変換できないため実行中のScriptは更新していません: ${blockingErrors[0]?.message ?? ""}`
                  : `「${asset.name}」は保存しましたが、MCPから変更された内容は未承認です。前回の正常なScriptを実行したままにしています`,
              );
            }
          }
          await tauri.completeXriftMcpRequest({
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
            await tauri.completeXriftMcpRequest({
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
            await tauri.completeXriftMcpRequest({
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
              "外部アセットを追加する前にProjectを保存してください",
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
          const applied = applyExternalStoreInstall(sourceBundle.assets, installed);
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
          sceneSelectionRef.current = null;
          assetSelectionRef.current = applied.primaryAssetId;
          saveStatusRef.current = "dirty";
          setHistory((current) =>
            commitEditorHistory(current, {
              bundle: nextBundle,
              sceneSelection: null,
              assetSelection: applied.primaryAssetId,
            }),
          );
          setSaveStatus("dirty");
          const activity = `AIが${installed.providerName}から「${installed.name}」をインストールしました`;
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
          await tauri.completeXriftMcpRequest({
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
          await tauri.completeXriftMcpRequest({
            id: request.id,
            ok: true,
            result: synchronizesScriptRuntime
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
          });
        } catch {
          setMcpError(
            "AI clientへ編集結果を返せませんでした。もう一度実行してください",
          );
        }
      } catch (error) {
        const editorError =
          error instanceof XriftMcpEditorToolError
            ? error
            : new XriftMcpEditorToolError(
                "EDITOR_ERROR",
                "AI編集を完了できませんでした",
              );
        try {
          await tauri.completeXriftMcpRequest({
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
            "AI clientへerrorを返せませんでした。もう一度実行してください",
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
        try {
          await tauri.setXriftMcpEditorReady(true);
          heartbeat = window.setInterval(() => {
            void tauri.setXriftMcpEditorReady(true).catch(() => undefined);
          }, 5_000);
        } catch {
          setMcpError(
            "AI editor bridgeを有効にできませんでした。XRift Studioを再起動してください",
          );
        }
      })
      .catch(() => {
        if (!disposed) {
          setMcpError(
            "AI editor bridgeへ接続できませんでした。XRift Studioを再起動してください",
          );
        }
      });

    return () => {
      disposed = true;
      unlisten?.();
      if (heartbeat !== undefined) window.clearInterval(heartbeat);
      void tauri.setXriftMcpEditorReady(false).catch(() => undefined);
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

  const handleSceneSettingsChange = useCallback(
    (settings: SceneSettings) => {
      if (editorMode !== "edit") return;
      updateScene((scene) =>
        JSON.stringify(scene.settings) === JSON.stringify(settings)
          ? scene
          : { ...scene, settings },
      );
      setNotice("シーン設定を更新しました。変更を自動保存します");
    },
    [editorMode, updateScene],
  );

  const handleUndo = useCallback(() => {
    setHistory((current) => {
      const transition = undoEditorHistory(current);
      if (transition.changed) {
        setSaveStatus("dirty");
        setNotice("元に戻しました");
      }
      return transition.history;
    });
  }, []);

  const handleRedo = useCallback(() => {
    setHistory((current) => {
      const transition = redoEditorHistory(current);
      if (transition.changed) {
        setSaveStatus("dirty");
        setNotice("やり直しました");
      }
      return transition.history;
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
    setNotice("コピーしたHierarchyを貼り付けました");
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
    const sourceNames = entityIds
      .map((entityId) => bundle.scene.entities[entityId]?.name)
      .filter((name): name is string => Boolean(name));
    const scene = deleteEntityHierarchy(bundle.scene, entityIds);
    if (scene === bundle.scene) return;
    setBundle(touchProject({ ...bundle, scene }));
    setSceneSelection(null);
    setAssetSelection(null);
    setNotice(sourceNames.length === 1 ? `「${sourceNames[0]}」を削除しました` : `${sourceNames.length}件のEntityを削除しました`);
  }, [bundle, editorMode, sceneSelection?.id, selectedEntityIds, setAssetSelection, setBundle, setSceneSelection]);

  const requestDeleteAsset = useCallback(
    (assetId: string) => {
      if (editorMode !== "edit" || importBusy) {
        setNotice(
          editorMode !== "edit"
            ? "Playを停止してからAssetを削除してください"
            : "アセットのインポート完了後に削除してください",
        );
        return;
      }
      const analysis = analyzeAssetDeletion(
        {
          assets: bundle.assets,
          scene: bundle.scene,
          prefabs: bundle.prefabs,
        },
        assetId,
      );
      if (!analysis.asset) {
        setNotice("削除するAssetが見つかりませんでした");
        return;
      }
      setDeleteDialog({
        kind: "asset",
        id: assetId,
        name: analysis.asset.name,
        canDelete: analysis.canDelete,
        references: analysis.references,
      });
    },
    [bundle.assets, bundle.prefabs, bundle.scene, editorMode, importBusy],
  );

  const requestDeleteAssetFolder = useCallback(
    (folderId: string) => {
      if (editorMode !== "edit" || importBusy) {
        setNotice(
          editorMode !== "edit"
            ? "Playを停止してからFolderを削除してください"
            : "アセットのインポート完了後にフォルダーを削除してください",
        );
        return;
      }
      const folder = bundle.assets.folders?.[folderId];
      if (!folder) {
        setNotice("削除するFolderが見つかりませんでした");
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
              : "Assetは削除されませんでした",
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
        setNotice("Folderに内容が追加されたため削除を中止しました");
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

  const handleMoveAsset = useCallback(
    (assetId: string, folderId: string | null) => {
      if (editorMode !== "edit" || importBusy) {
        setNotice(
          editorMode !== "edit"
            ? "Playを停止してからAssetを移動してください"
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
              ? "AssetはすでにこのFolderにあります"
              : "この場所へAssetを移動できませんでした",
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
            ? "Playを停止してからFolderを移動してください"
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
              ? "Folderを自分自身または子Folderへ移動できません"
              : result.reason === "same-parent"
                ? "Folderはすでにこの場所にあります"
                : result.reason === "duplicate-name"
                  ? "同じ名前のFolderが移動先にあります"
                  : "この場所へFolderを移動できませんでした";
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
        setNotice("アセットのインポート完了後にXRift Componentを配置してください");
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
          setNotice("このプロジェクトにはXRift Componentを配置できませんでした");
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
            : `「${result.recipe.name}」をSceneへ配置しました`,
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
        setNotice("アセットのインポート完了後にHierarchyを移動してください");
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
              ? "Prefab documentが見つからないため配置できませんでした"
              : result.reason === "parent-missing"
                ? "配置先のEntityが見つかりませんでした"
                : "このAssetはSceneへ配置できません";
          setNotice(message);
          return current;
        }
        const parentName = options.parentEntityId
          ? result.scene.entities[options.parentEntityId]?.name
          : null;
        setSaveStatus("dirty");
        setNotice(
          `「${result.assetName}」を${parentName ? `「${parentName}」の子` : "Scene"}へ配置しました`,
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

  const handlePlacePrimitive = useCallback(
    (creationId: string, position?: Vec3) => {
      const definition = getBuiltinPrimitiveCreation(creationId);
      if (!definition) return;

      const preferredMaterialId = {
        box: BUILTIN_ASSET_IDS.material.blue,
        sphere: BUILTIN_ASSET_IDS.material.violet,
        cylinder: BUILTIN_ASSET_IDS.material.green,
        cone: BUILTIN_ASSET_IDS.material.orange,
        plane: BUILTIN_ASSET_IDS.material.slate,
      }[definition.primitive];
      const materialAssetId =
        bundle.assets.assets[preferredMaterialId]?.kind === "material"
          ? preferredMaterialId
          : Object.values(bundle.assets.assets).find(
              (asset) => asset.kind === "material",
            )?.id;
      if (!materialAssetId) {
        setNotice("Primitiveを配置するMaterialがありません");
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
        bundle.assets,
        creationId,
        materialAssetId,
        position ?? fallbackPosition,
      );
      if (!result) {
        setNotice("このプリミティブを現在のシーンへ配置できませんでした");
        return;
      }
      setBundle(touchProject({ ...bundle, scene: result.scene }));
      setSceneSelection({ kind: "entity", id: result.entityId });
      setAssetSelection(null);
      setNotice(`「${definition.name}」をシーンへ追加しました`);
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
            ? `「${parentName}」の子にEmpty Entityを作成しました`
            : "Scene RootにEmpty Entityを作成しました",
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
        setNotice("このXRift Componentは既存Entityへ追加してください");
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
          setNotice(`${definition.label}をSceneへ作成できませんでした`);
          return current;
        }
        setSaveStatus("dirty");
        setNotice(
          `${definition.label}をSceneへ作成しました。Inspectorで設定できます`,
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
            ? "Playを停止してからXRift Componentを追加してください"
            : "アセットのインポート完了後にXRift Componentを追加してください",
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
              "Classic Assetの保存先が必要です。先にVisualプロジェクトを保存してから変換してください",
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
              "変換したComponentをSceneへ追加できませんでした",
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
            ? `${result.entityIds.length}件とAsset ${assetCount}件を追加しました。読み取れなかったAsset ${unavailableAssetCount}件はスキップしました`
            : warningCount > 0
            ? `${result.entityIds.length}件とAsset ${assetCount}件を追加しました。${warningCount}件の変換メモがあります`
            : `${result.entityIds.length}件とAsset ${assetCount}件をSceneへ変換しました`;
        setNotice(
          enterPlayAfterImport && playStarted
            ? `${importMessage}。Playで実行結果を確認しています`
            : enterPlayAfterImport
              ? `${importMessage}。Scriptの確認または変換が完了していないためEditのままです`
            : importMessage,
        );
        return true;
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Classicプロジェクトを変換できませんでした",
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
      setNotice("Transformの変更をシーンへ反映しました");
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
      if (changed) setNotice("Transformの変更を取り消しました");
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
          ? "Entity名を保存し、実行中のSceneへ即時反映しました"
          : "Entity名を変更しました",
      );
    },
    [editorMode, updateScene],
  );

  const handleEntityEnabledChange = useCallback(
    (entityId: string, enabled: boolean) => {
      updateScene((scene) => {
        const entity = scene.entities[entityId];
        const next = updateEntityEnabled(scene, entityId, enabled);
        if (next !== scene) {
          setNotice(
            `「${entity?.name ?? "Entity"}」を${enabled ? "有効" : "無効"}にしました`,
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
          : "Mesh Rendererのマテリアルスロットと影設定をシーンへ反映しました",
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
          ? "Collider設定を保存し、このEntityのPlayを先頭から再実行しました"
          : "Collider設定をSceneへ反映しました",
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
          ? "Rigid Body設定を保存し、このBodyを先頭から再実行しました"
          : "Rigid Body設定をSceneへ反映しました",
      );
    },
    [editorMode, playSession, updateScene],
  );

  const handleExternalStoreInstalled = useCallback(
    (
      result: Parameters<typeof applyExternalStoreInstall>[1],
      applySkybox: boolean,
    ) => {
      setHistory((current) => {
        const applied = applyExternalStoreInstall(
          current.present.bundle.assets,
          result,
        );
        const scene = applySkybox
          ? assignSkyboxToScene(
              current.present.bundle.scene,
              applied.primaryAssetId,
            )
          : current.present.bundle.scene;
        const primary = applied.manifest.assets[applied.primaryAssetId];
        setActiveAssetFolderId(primary?.folderId ?? null);
        setSaveStatus("dirty");
        setNotice(
          applySkybox
            ? `「${result.name}」をインストールし、Skyboxへ設定しました`
            : `「${result.name}」をインストールしました。Assetsで選択されています`,
        );
        return commitEditorHistory(current, {
          bundle: touchProject({
            ...current.present.bundle,
            assets: applied.manifest,
            scene,
          }),
          sceneSelection: null,
          assetSelection: applied.primaryAssetId,
        });
      });
      setSceneSettingsOpen(false);
    },
    [],
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
        setNotice(
          applied.alreadyInstalled
            ? `「${entry.label}」は追加済みです。Assetsで選択しました`
            : `「${entry.label}」をOpen Brush Materialとして追加しました`,
        );
        if (applied.alreadyInstalled) {
          return {
            ...current,
            present: {
              ...current.present,
              sceneSelection: null,
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
          sceneSelection: null,
          assetSelection: applied.primaryAssetId,
        });
      });
      setSceneSettingsOpen(false);
      return { alreadyInstalled: preview.alreadyInstalled };
    },
    [bundle.assets],
  );

  const handleAssignSkybox = useCallback(
    (assetId: string) => {
      if (editorMode !== "edit") return;
      const asset = bundle.assets.assets[assetId];
      if (!isEnvironmentTextureAsset(asset) && asset?.kind !== "skybox") {
        setNotice("Skyboxに使えるTexture Assetを読み取れませんでした");
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
      const definition = getEditorComponentMenuDefinitions(projectKind).find(
        (candidate) => candidate.id === componentDefinitionId,
      );
      if (
        !definition ||
        definition.id === "core.transform" ||
        definition.id === "physics.mesh-collider"
      ) {
        setNotice("このComponentは既存Entityへ追加してください");
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
            name: "新規Particle 1",
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
        );
        if (!added.added) {
          setNotice(`${definition.label}をSceneへ作成できませんでした`);
          return current;
        }
        setSaveStatus("dirty");
        setNotice(
          createdParticle
            ? "Particle AssetとParticle Emitter Entityを作成しました"
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
    [editorMode, importBusy, projectKind],
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
            ? "Light種別を保存し、このEntityのPlayを先頭から再実行しました"
            : "Light設定を保存し、実行状態を保ったままPlayへ即時反映しました"
          : "Light設定をSceneへ反映しました",
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
          ? "Text設定を保存し、このEntityのPlayを先頭から再実行しました"
          : "Text設定をSceneへ反映しました",
      );
    },
    [editorMode, playSession, updateScene],
  );

  const handleSetSelectedEntitiesEnabled = useCallback(
    (enabled: boolean) => {
      if (editorMode !== "edit" || selectedEntityIds.length < 2) return;
      updateScene((scene) => selectedEntityIds.reduce(
        (next, entityId) => updateEntityEnabled(next, entityId, enabled),
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
      setNotice(`${selectedEntityIds.length}件のLightへCast Shadow設定を反映しました`);
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
        setNotice(`${materialIds.length}件のMaterialを更新し、参照中のMesh previewへ反映しました`);
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
            ? "Audio Source構成を保存し、このEntityのPlayを先頭から再実行しました"
            : "Audio Source設定を保存し、実行状態を保ったままPlayへ即時反映しました"
          : "Audio Source設定をSceneへ反映しました",
      );
    },
    [editorMode, playSession, updateScene],
  );

  const handleAnimationChange = useCallback(
    (entityId: string, componentId: string, patch: AnimationPatch) => {
      if (editorMode !== "edit" && !playSession) return;
      updateScene((scene) =>
        updateAnimationComponent(scene, entityId, patch, componentId),
      );
      setNotice(
        editorMode === "play"
          ? "Animation設定を保存し、このEntityのPlayを先頭から再実行しました"
          : "Animation設定をSceneへ反映しました",
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
        setNotice("自動フィットに使えるMesh boundsがありません");
        return;
      }
      const fitted = autoFitBoxCollider(
        bundle.scene,
        bundle.assets,
        entityId,
        componentId,
      );
      if (fitted === bundle.scene) {
        setNotice("Box Colliderは現在のMesh boundsに一致しています");
        return;
      }
      updateScene(() => fitted);
      setNotice("Box Colliderを現在のMesh boundsへ合わせました");
    },
    [bundle.assets, bundle.scene, editorMode, playSession, updateScene],
  );

  const handleOptimizeColliders = useCallback(
    (entityIds?: readonly string[]) => {
      if (editorMode !== "edit" && !playSession) return;
      const optimized = optimizeColliderConfiguration(bundle.scene, { entityIds });
      if (optimized.changes.length === 0) {
        setNotice("Colliderの設定に自動修正できる問題はありません");
        return;
      }
      updateScene(() => optimized.scene);
      setNotice(
        `${optimized.changes.length}件のCollider設定を最適化しました。MCPのinspect_colliders / optimize_collidersでも同じ操作ができます`,
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
        setNotice("選択したParticle Assetを参照できませんでした");
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
          ? "Particle Emitter設定を保存し、このEntityのPlayを先頭から再実行しました"
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
          ? "Particle Emitterを削除し、このEntityのPlayを先頭から再実行しました"
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
        setNotice("Playを停止してからMaterialを適用してください");
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
            "entity-missing": "Materialの適用先Entityが見つかりません",
            "mesh-missing": "MaterialはMeshを持つEntityへドロップしてください",
            "material-missing": "ドラッグしたMaterial Assetが見つかりません",
            "slot-missing": "Meshに適用できるMaterial slotがありません",
            unchanged: "選択したSlotにはこのMaterialが適用済みです",
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
            ? `Materialを「${assignment.slots[0]}」slotへ適用しました`
            : `Materialを${assignment.slots.length}個のslotへ適用しました`,
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
        setNotice("Playを停止してからMaterialを適用してください");
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
          "entity-missing": "Materialの適用先Entityが見つかりません",
          "mesh-missing": "MaterialはMeshを持つEntityへドロップしてください",
          "slot-missing": "Meshに適用できるMaterial slotがありません",
        }[target.reason];
        setNotice(message);
        return;
      }
      const material = bundle.assets.assets[materialAssetId];
      if (material?.kind !== "material") {
        setNotice("ドラッグしたMaterial Assetが見つかりません");
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
        setNotice("Materialの適用先Meshが見つかりません");
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
      setNotice("適用するMaterial slotを選択してください");
    },
    [bundle, commitMaterialAssignment, editorMode],
  );

  const handleMaterialChange = useCallback(
    (assetId: string, patch: MaterialAssetPatch) => {
      if (editorMode !== "edit" && !playSession) return;
      setBundle((current) => {
        const assets = updateMaterialAsset(current.assets, assetId, patch);
        if (assets === current.assets) {
          setNotice("Material値は変更されませんでした。不正値は元の値を保持します");
          return current;
        }
        setNotice(
          editorMode === "play"
            ? "Material設定を保存し、参照中のEntityだけPlayへ再反映しました"
            : "Material IRを更新し、参照中のMesh previewへ反映しました",
        );
        return touchProject({ ...current, assets });
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
        setNotice(`このShader Assetは${shaderAsset.stage}用です。${stage}用のAssetを選択してください`);
        return;
      }
      if (shaderAsset?.kind !== "shader" || !projectPath) {
        setNotice("GLSL Assetを読み込むにはプロジェクトを保存してください");
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
        setNotice(`「${shaderAsset.name}」を${stage} GLSLとしてMaterialへ設定しました`);
      } catch (cause) {
        setNotice(
          cause instanceof Error
            ? `GLSL Assetを読み込めませんでした: ${cause.message}`
            : "GLSL Assetを読み込めませんでした",
        );
      }
    },
    [handleMaterialChange, projectPath],
  );

  const handleModelChange = useCallback(
    (assetId: string, patch: ModelAssetPatch) => {
      if (editorMode !== "edit") return;
      if (modelReimportBusy) {
        setNotice("Modelの再インポート完了後に設定を変更できます");
        return;
      }
      setBundle((current) => {
        const assets = updateModelAsset(current.assets, assetId, patch);
        if (assets === current.assets) {
          setNotice("Model設定は変更されませんでした。不正値は元の値を保持します");
          return current;
        }
        setNotice("ModelのImport Recipeと既定Material割当を更新しました");
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
        },
      );
      if (!availability.allowed) {
        setNotice(availability.disabledReason);
        return;
      }
      if (!projectPath) {
        setNotice("初回の自動保存完了後にModelを再インポートできます");
        return;
      }

      const startingBundle = bundleRef.current;
      const startingAsset = startingBundle.assets.assets[assetId];
      if (startingAsset?.kind !== "model") {
        setNotice("再インポートするModel Assetが見つかりません");
        return;
      }
      if (startingAsset.source.kind !== "project") {
        setNotice("プロジェクト内に保存されたModelだけ再インポートできます");
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
        const message = "再インポート結果を確認できませんでした。元のAssetは保持されています";
        setModelReimportFeedback({
          assetId,
          state: { phase: "failed", message },
        });
        setNotice(message);
        return;
      }

      if (bundleRef.current.assets.assets[assetId] !== startingAsset) {
        const message =
          "処理中にModel設定が変更されたため、自動適用を取り消しました。元のAssetは保持されています";
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
            "処理中にModel設定が変更されたため、自動適用を取り消しました。元のAssetは保持されています";
          setModelReimportFeedback({
            assetId,
            state: { phase: "failed", message },
          });
          setNotice(message);
          return current;
        }
        const nextBundle = touchProject({
          ...current.present.bundle,
          assets: result.manifest,
        });
        bundleRef.current = nextBundle;
        setSaveStatus("dirty");
        setModelReimportFeedback({
          assetId,
          state: {
            phase: "succeeded",
            message: "Modelを再インポートしました。変更を自動保存します",
          },
        });
        setNotice(
          `「${reimportedAsset.name}」を再インポートし、モデル由来MaterialとTextureを更新しました`,
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
      setBundle((current) => {
        const assets = updateTextureAsset(current.assets, assetId, patch);
        if (assets === current.assets) return current;
        setNotice("Texture Import設定IRを更新しました。画像変換・圧縮は未実行です");
        return touchProject({ ...current, assets });
      });
    },
    [editorMode],
  );

  const handleParticleChange = useCallback(
    (assetId: string, patch: ParticlePropertiesPatch) => {
      if (editorMode !== "edit" && !playSession) return;
      setBundle((current) => {
        const assets = updateParticleAsset(current.assets, assetId, patch);
        if (assets === current.assets) return current;
        setNotice(
          editorMode === "play"
            ? "Particle設定を保存し、参照中のEmitterだけPlayへ再反映しました"
            : "Particle設定を更新し、参照中のEmitterへ反映しました",
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
            ? "Playを停止してからAssetを作成してください"
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
          setNotice("作成先のFolderが見つかりません。Folderを開き直してください");
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
          setNotice("Assetを作成できませんでした。作成先を確認してください");
          return current;
        }
        const destination = folderId
          ? `「${assets.folders?.[folderId]?.name ?? "Folder"}」`
          : "Assets直下";
        setSaveStatus("dirty");
        setNotice(
          kind === "material"
            ? `標準glTFマテリアルを${destination}に作成し、Asset Inspectorで開きました`
            : kind === "particle"
              ? `Particleを${destination}に作成し、Asset Inspectorで開きました`
              : `KHR_interactivity Graphを${destination}に作成し、専用Editorで開きました`,
        );
        if (kind === "interactivity") {
          setInteractivityEditorAssetId(added.assetId);
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
      setNotice("Folderを作成しました");
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
        setNotice(`「${entity.name}」からPrefabを作成しました`);
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
      setNotice("Rigid Bodyを削除しました。子孫のColliderは保持されています");
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
              ? `「${entity.name}」のScript設定を反映し、このEntityだけ再起動しました`
              : `「${entity.name}」のScript propertyを次のフレームへ反映しました`
            : "Script Componentを更新しました",
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
      setNotice("プロジェクトを保存するとScriptを作成できます");
      return false;
    }
    const template = getScriptTemplate(request.templateId);
    const source = createScriptTemplateSource(request.templateId, request.name);
    if (!template || source === null) {
      setNotice("選択したScript Templateを読み込めませんでした");
      return false;
    }
    const currentAssets = bundleRef.current.assets;
    const folderId = scriptTemplateFolderId;
    if (folderId && !currentAssets.folders?.[folderId]) {
      setNotice("作成先のFolderが見つかりません。Folderを開き直してください");
      return false;
    }
    const name = request.name.trim();
    if (!name) {
      setNotice("Script名を入力してください");
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
        setNotice("選択中のEntityが見つかりません。Hierarchyで選び直してください");
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
            "選択中のEntityへScript Componentを追加できませんでした",
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
          ? `Scriptを作成できませんでした: ${error.message}`
          : "Scriptを作成できませんでした",
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
    try {
      await approveExactScriptSourceForUi(
        asset,
        source,
        templateProvenance,
      );
    } catch {
      // Creation remains useful while the native approval store is
      // unavailable; the first Play will fail closed and ask again.
    }
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
            ? `${template.name}から「${name}」を${destination}に作成しました。選択Entityが更新されたためComponentは追加していません`
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
    approveExactScriptSourceForUi,
    editorMode,
    projectKind,
    scriptEditor,
    scriptTemplateFolderId,
  ]);

  const handleSaveInteractivityAsset = useCallback(
    (assetId: string, extension: KhrInteractivityExtension) => {
      if (editorMode !== "edit") return;
      setBundle((current) => {
        const assets = updateInteractivityAsset(current.assets, assetId, extension);
        if (assets === current.assets) {
          setNotice("KHR_interactivity Graphに検証エラーがあるため保存しませんでした");
          return current;
        }
        setNotice("KHR_interactivity GraphをAssetへ保存しました。別Sceneでも再利用できます");
        return touchProject({ ...current, assets });
      });
    },
    [editorMode, setBundle],
  );

  const handleSetProjectThumbnailFromAsset = useCallback(
    async (assetId: string) => {
      if (projectThumbnailBusyRef.current) return;
      if (!projectPath) {
        setNotice("プロジェクトを保存するとサムネイルを設定できます");
        return;
      }
      const asset = bundleRef.current.assets.assets[assetId];
      if (!asset || (asset.kind !== "texture" && asset.kind !== "skybox")) {
        setNotice("サムネイルに使用できるTexture Assetが見つかりません");
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
          ? `「${asset.name}」のサムネイルを更新できませんでした。プロジェクトを開き直すかMaterialを変更すると再試行します`
          : "Materialサムネイルの準備に失敗しました。プロジェクトを開き直すと再試行します",
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

  const handleUpdatePrefab = useCallback(
    (prefabId: string) => {
      if (editorMode !== "edit" || importBusy) {
        setNotice(
          editorMode !== "edit"
            ? "Playを停止してからPrefabをUpdateしてください"
            : "アセットのインポート完了後にPrefabをUpdateしてください",
        );
        return;
      }
      setHistory((current) => {
        const document = current.present.bundle.prefabs[prefabId];
        if (!document) {
          setNotice("UpdateするPrefab documentが見つかりません");
          return current;
        }
        const updated = updatePrefabDocumentFromSource(
          current.present.bundle.scene,
          current.present.bundle.assets,
          document,
        );
        if (!updated) {
          setNotice("Prefab sourceのHierarchyを読み取れませんでした");
          return current;
        }
        setSaveStatus("dirty");
        setNotice(`「${document.name}」を現在のHierarchyで更新しました`);
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

  const handleAddComponent = useCallback(
    (entityId: string, componentDefinitionId: string) => {
      const fallbackParticleId = createDocumentId("particle");
      setBundle((current) => {
        let assets = current.assets;
        let createdParticle = false;
        if (
          componentDefinitionId === "core.particle" &&
          !Object.values(assets.assets).some((asset) => asset.kind === "particle")
        ) {
          const added = addDefaultParticleAsset(assets, {
            id: fallbackParticleId,
            name: "新規Particle 1",
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
          componentDefinitionId === "scripting.script"
            ? assetSelection ?? undefined
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
                ? "このProject種別では追加できません"
                : result.reason === "dependency-missing"
                  ? componentDefinitionId === "scripting.script"
                    ? "先にAssetsでScriptを作成してください"
                    : "必要なMeshまたはAssetがありません"
                  : "Componentを追加できませんでした";
          setNotice(reason);
          return current;
        }
        setNotice(
          createdParticle
            ? "Particle Assetを作成し、Particle Emitterを追加しました"
            : "Componentを追加しました",
        );
        return touchProject({ ...current, assets, scene: result.scene });
      });
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
              "XRift Componentを更新できませんでした",
          );
          return scene;
        }
        const error = result.diagnostics.find(
          (diagnostic) => diagnostic.severity === "error",
        );
        setNotice(
          error?.message ??
            (editorMode === "play"
              ? "XRift Component設定を保存し、このEntityのPlayを先頭から再実行しました"
              : "XRift Componentの設定をシーンへ反映しました"),
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
              "XRift Componentを削除できませんでした",
          );
          return scene;
        }
        setNotice(
          editorMode === "play"
            ? "XRift Componentを削除し、このEntityのPlayを先頭から再実行しました"
            : "XRift Componentを削除しました",
        );
        return result.scene;
      });
    },
    [editorMode, playSession, updateScene],
  );

  const handleSelectAsset = useCallback((assetId: string) => {
    setSceneSettingsOpen(false);
    setAssetSelection(assetId);
    setNotice("Asset Inspectorへ切り替えました。シーン内の選択は維持しています");
  }, []);

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
                          message: "Import元ファイルを読み直してください",
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
                `「${queued.name}」からPrefab ${unityPlan.result.prefabCount}件、Entity ${unityPlan.result.entityCount}件、Asset ${unityPlan.result.assetCount}件を再構築しました`,
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
                              message: `同じ内容のShader Asset「${duplicate.name}」を選択しました。`,
                            },
                          ],
                        }
                      : entry,
                  ),
                );
                setNotice(`同じ内容のShader Asset「${duplicate.name}」は登録済みです`);
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
                setNotice(`${queued.name}をShader Assetにできませんでした`);
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
              setNotice(`「${imported.name}」をGLSL Shader Assetとしてインポートしました`);
              continue;
            }
            const plan = await createAssetImportPlan({
              fileName: sourceFile.name,
              bytes,
              mimeType: sourceFile.type,
              folderId,
              existingManifest: workingManifest,
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
                )?.message ?? `${queued.name}をImportできませんでした`,
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
                            message: `同じ内容のアセット「${duplicate.name}」を選択しました。ファイルは再コピーしていません。`,
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
              throw new Error("Import済みAssetをManifestへ反映できませんでした");
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
                  ? `「${importedAsset.name}」を更新し、MaterialとTextureの参照を維持しました`
                  : `「${importedAsset.name}」をインポートし、Material ${plan.derivedAssets?.filter((asset) => asset.kind === "material").length ?? 0}件、Texture ${plan.derivedAssets?.filter((asset) => asset.kind === "texture").length ?? 0}件を展開しました`,
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
            setNotice(`${queued.name}のImportに失敗しました: ${message}`);
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

  const handleQueueFiles = useCallback((files: File[]) => {
    const availability = resolveAssetOperationAvailability("asset-import", {
      readOnly: editorMode !== "edit",
      assetImportActive:
        importRunningRef.current || hasActiveAssetImport(importQueueRef.current),
      modelReimportActive:
        assetOperationRef.current?.kind === "model-reimport",
    });
    if (!availability.allowed) {
      setNotice(availability.disabledReason);
      return;
    }
    const accepted: Array<{
      file: File;
      resourceKind: PendingImport["resourceKind"];
    }> = [];
    for (const file of files) {
      if (SUPPORTED_UNITY_FILE.test(file.name)) {
        accepted.push({ file, resourceKind: "unity-package" });
      } else if (SUPPORTED_TEXTURE_FILE.test(file.name)) {
        accepted.push({ file, resourceKind: "texture" });
      } else if (SUPPORTED_MODEL_FILE.test(file.name)) {
        accepted.push({ file, resourceKind: "model" });
      } else if (SUPPORTED_HDRI_FILE.test(file.name)) {
        accepted.push({ file, resourceKind: "skybox" });
      } else if (SUPPORTED_AUDIO_FILE.test(file.name)) {
        accepted.push({ file, resourceKind: "audio" });
      } else if (SUPPORTED_SHADER_FILE.test(file.name)) {
        accepted.push({ file, resourceKind: "shader" });
      }
    }
    const unsupported = files.filter(
      (file) =>
        !SUPPORTED_UNITY_FILE.test(file.name) &&
        !SUPPORTED_MODEL_FILE.test(file.name) &&
        !SUPPORTED_TEXTURE_FILE.test(file.name) &&
        !SUPPORTED_HDRI_FILE.test(file.name) &&
        !SUPPORTED_AUDIO_FILE.test(file.name) &&
        !SUPPORTED_SHADER_FILE.test(file.name),
    );

    if (unsupported.length > 0) {
      const names = unsupported.slice(0, 3).map((file) => file.name).join("、");
      setImportError(
        `${names}${unsupported.length > 3 ? " ほか" : ""} は対象外です。Unity、Three.js Editor対応モデル、画像、HDR / EXR、MP3 / WAV、GLSL（.glsl / .vert / .frag）に対応します。`,
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
      }));
    updateImportQueue((current) => [...current, ...queued]);
    if (projectPath) {
      setNotice(`アセット${accepted.length}件のインポートを開始しました`);
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
      setNotice("アセットのインポート完了後にPlayを開始できます");
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
    let preparationResolvedScope =
      resolvedScriptExecutionScopeRef.current &&
      sameScriptExecutionScopeInput(
        resolvedScriptExecutionScopeRef.current,
        preparationScopeInput,
      )
        ? resolvedScriptExecutionScopeRef.current
        : null;
    const preparationIsCurrent = (): boolean => {
      if (
        playPreparationGenerationRef.current !== preparationGeneration ||
        !sameScriptExecutionScopeInput(
          scriptExecutionScopeInputRef.current,
          preparationScopeInput,
        )
      ) {
        return false;
      }
      const currentResolvedScope = resolvedScriptExecutionScopeRef.current;
      if (preparationResolvedScope) {
        return Boolean(
          currentResolvedScope &&
            sameResolvedScriptExecutionScope(
              currentResolvedScope,
              preparationResolvedScope,
            ),
        );
      }
      if (currentResolvedScope) {
        preparationResolvedScope = currentResolvedScope;
      }
      return true;
    };
    const stoppedForScopeChange = (): EnterPlayModeResult => {
      activePlayUnapprovedPolicyRef.current = "block";
      preparedScriptRuntimeInputKeyRef.current = null;
      setPlaySession(null);
      setEditorMode("edit");
      scriptRuntime.reset();
      setNotice(
        "Projectの実行範囲が変わったためPlay準備を中止しました。現在のProjectで改めてPlayしてください",
      );
      return stopped();
    };
    setCreateMenuOpen(false);
    setRenameTarget(null);

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
          "Scriptを保存中のためPlayを開始できません。保存完了後にもう一度開始してください",
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
        const pendingApproval = approvalRequiredSnapshots(errors);
        const blockingErrors = blockingScriptCompileErrors(errors);
        if (
          pendingApproval.length > 0 &&
          unapprovedPolicy !== "skip"
        ) {
          if (!options.interactive) {
            setNotice(
              `${pendingApproval.length}件のScriptは未承認のためPlayを開始しません。Studioで内容を確認してください`,
            );
            return stopped(errors, pendingApproval);
          }
          const dialogResult =
            await requestScriptTrustDecision(pendingApproval);
          if (!preparationIsCurrent()) {
            return stoppedForScopeChange();
          }
          if (dialogResult.decision === "cancel") {
            setNotice("Scriptの実行をキャンセルしました");
            return stopped(errors, pendingApproval);
          }
          if (dialogResult.decision === "skip-and-play") {
            unapprovedPolicy = "skip";
            continue;
          }

          const displayedKey = createScriptTrustSnapshotKey(
            pendingApproval.map((snapshot) => ({
              id: snapshot.assetId,
              hash: snapshot.fingerprint.sourceSha256,
            })),
          );
          if (dialogResult.snapshotKey !== displayedKey) {
            setNotice(
              "確認中にScript一覧が変わりました。最新の内容をもう一度確認してください",
            );
            continue;
          }

          // Re-read only to reject a stale dialog. The following compile reads
          // once again and checks the exact approved fingerprint before it can
          // evaluate, so a post-approval filesystem swap still fails closed.
          const freshTargets: Array<{
            id: string;
            hash: string;
            fingerprint: ScriptExecutionFingerprint;
          }> = [];
          let stale = false;
          for (const snapshot of pendingApproval) {
            const latestAsset =
              bundleRef.current.assets.assets[snapshot.assetId];
            if (
              !latestAsset ||
              latestAsset.kind !== "script" ||
              latestAsset.source.relativePath !== snapshot.path ||
              latestAsset.language !== snapshot.language
            ) {
              stale = true;
              break;
            }
            try {
              const source = await tauri.readScriptSource(
                projectPathRef.current ?? "",
                latestAsset.source.relativePath,
              );
              if (!preparationIsCurrent()) {
                return stoppedForScopeChange();
              }
              const fingerprint = await createScriptTrustFingerprint({
                source,
                language: latestAsset.language,
                contractVersion: latestAsset.contractVersion,
                allowRemoteModules: false,
              });
              if (!preparationIsCurrent()) {
                return stoppedForScopeChange();
              }
              freshTargets.push({
                id: latestAsset.id,
                hash: fingerprint.sourceSha256,
                fingerprint,
              });
            } catch {
              if (!preparationIsCurrent()) {
                return stoppedForScopeChange();
              }
              stale = true;
              break;
            }
          }
          const freshKey = createScriptTrustSnapshotKey(freshTargets);
          if (
            stale ||
            freshKey !== dialogResult.snapshotKey ||
            bundleRef.current !== preparingBundle ||
            scriptSourceRevisionRef.current !== preparingSourceRevision ||
            pendingScriptPathsRef.current.size > 0
          ) {
            setNotice(
              "確認中にScriptが更新されました。最新の内容をもう一度確認してください",
            );
            continue;
          }
          try {
            await approveScriptFingerprintsForUi(
              freshTargets.map(({ fingerprint }) => ({ fingerprint })),
            );
            if (!preparationIsCurrent()) {
              return stoppedForScopeChange();
            }
          } catch {
            if (!preparationIsCurrent()) {
              return stoppedForScopeChange();
            }
            setNotice(
              "Scriptの実行許可を安全に保存できませんでした。アプリデータを確認して再試行してください",
            );
            return stopped(errors, pendingApproval);
          }
          continue;
        }
        if (blockingErrors.length > 0) {
          setNotice(
            `Scriptを変換できないためPlayを開始しません: ${blockingErrors[0]?.assetName ?? ""} ${blockingErrors[0]?.message ?? ""}`,
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
          pendingApproval.length > 0
            ? `${pendingApproval.length}件の未承認Scriptを停止したままPlayを開始しました`
            : projectKind === "world"
              ? "World Play Modeを開始しました"
              : "Item Play Modeを開始しました",
        );
        return {
          started: true,
          errors,
          approvalRequired: pendingApproval,
          skippedAssetIds: pendingApproval.map(
            (snapshot) => snapshot.assetId,
          ),
        };
      }
      setNotice(
        "Play準備中にScriptまたはSceneが続けて更新されました。更新が落ち着いてからもう一度開始してください",
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
    approveScriptFingerprintsForUi,
    importBusy,
    projectKind,
    requestScriptTrustDecision,
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
    setNotice("Playを停止しました。Play中の状態を破棄し、編集カメラへ戻りました");
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
      setNotice("Desktop shellからUploadProject callbackを指定してください");
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
      setNotice("Classicへの書き出しはデスクトップ版で利用できます");
      return;
    }
    try {
      await onClassicExport(bundle);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Classicへの書き出しを開始できませんでした",
      );
    }
  }, [bundle, onClassicExport]);

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
            setNotice("プロジェクトを保存するとScriptを作成できます");
            return false;
          }
          if (
            payload.folderId &&
            !bundle.assets.folders?.[payload.folderId]
          ) {
            setNotice("作成先のFolderが見つかりません。Folderを開き直してください");
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
        scriptTemplateFolderId !== undefined
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

  const handleBack = useCallback(async () => {
    if (leaving) return;
    setPlaySession(null);
    setEditorMode("edit");
    if (!onSaveRef.current) {
      onBack();
      return;
    }
    setLeaving(true);
    while (lastSavedBundleRef.current !== bundleRef.current) {
      const target = bundleRef.current;
      await requestAutosave(target);
      if (lastSavedBundleRef.current !== target) {
        setLeaving(false);
        return;
      }
    }
    setLeaving(false);
    onBack();
  }, [leaving, onBack, requestAutosave]);

  const kindLabel = projectKind === "world" ? "ワールド" : "アイテム";
  const KindIcon = projectKind === "world" ? EDITOR_ICONS.world : EDITOR_ICONS.item;
  const BackIcon = EDITOR_ICONS.back;
  const SaveIcon = EDITOR_ICONS.save;
  const UploadIcon = EDITOR_ICONS.upload;
  const ExportIcon = EDITOR_ICONS.export;
  const CreateIcon = EDITOR_ICONS.create;
  const saveStatusLabel =
    saveStatus === "saved"
      ? "保存済み"
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
  const hierarchyTrack = `min(${layout.hierarchyWidth}px, 22%)`;
  const inspectorTrack = `min(${layout.inspectorWidth}px, 36%)`;
  const assetsTrack = `min(${layout.assetsHeight}px, calc(100% - 240px))`;

  return (
    <div className="h-screen overflow-hidden bg-editor-canvas">
      <div className="flex h-full min-h-0 min-w-0 flex-col bg-editor-canvas text-editor-text">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-editor-border bg-editor-surface px-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              disabled={leaving}
              onClick={() => void handleBack()}
              title={commandTitle(`${backLabel}へ戻る`, "CloseVisualEditor")}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-editor-border bg-editor-surface px-2.5 py-1.5 text-xs font-semibold text-editor-text hover:bg-editor-subtle disabled:cursor-wait disabled:opacity-50"
            >
              <BackIcon size={13} aria-hidden="true" />
              {leaving ? "保存して戻っています" : backLabel}
            </button>
            <div className="min-w-0 border-l border-editor-border pl-2.5">
              <p className="truncate text-sm font-semibold text-editor-text">
                {bundle.project.metadata.title}
              </p>
              <p className="flex items-center gap-1 text-xs text-editor-muted">
                <KindIcon size={11} aria-hidden="true" />
                {kindLabel} · ビジュアル編集
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span
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
            </span>
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
                  ? "Playを停止してからImportしてください"
                  : assetImportPanelAvailability.disabledReason
              }
              onImportModel={() => globalModelImportInputRef.current?.click()}
              onImportR3f={() => setComponentImportOpen(true)}
            />
            <button
              type="button"
              onClick={() => void runClassicExport()}
              title="Runtime JSONとAssetをXRift Classicプロジェクトへ書き出す"
              className="flex items-center gap-1.5 rounded-md border border-editor-border bg-editor-surface px-3 py-1.5 text-xs font-semibold text-editor-text hover:bg-editor-subtle"
            >
              <ExportIcon size={13} aria-hidden="true" />
              Classicへ書き出す
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
          </div>
        </header>

        <div className="flex h-10 shrink-0 items-center border-b border-editor-border bg-editor-surface px-2.5" role="toolbar" aria-label="ビジュアルエディターのツール">
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
                title={commandTitle("シーンオブジェクトを作成", "OpenCreateMenu", "Ctrl+Shift+A")}
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
                selectedEntity={
                  sceneSelection?.id
                    ? bundle.scene.entities[sceneSelection.id]
                    : undefined
                }
                builtinPrefabRecipes={builtinPrefabRecipes}
                onClose={() => setCreateMenuOpen(false)}
                onCreateEmpty={() => executeCommand("entity.create-empty")}
                onCreatePrimitive={(creationId) =>
                  executeCommand("entity.create-primitive", { creationId })
                }
                onPlaceBuiltinPrefab={handlePlaceBuiltinPrefab}
                onCreateXriftObject={handleCreateXriftObject}
                onCreateComponentObject={handleCreateComponentObject}
                onAddComponent={(entityId, componentDefinitionId) =>
                  executeCommand("entity.add-component", {
                    entityId,
                    componentDefinitionId,
                  })
                }
              />
            </div>
          </div>

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
                "選択中のFolder"
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
        {scriptTrustPrompt ? (
          <ScriptTrustDialog
            key={createScriptTrustSnapshotKey(
              scriptTrustPrompt.snapshots.map((snapshot) => ({
                id: snapshot.assetId,
                hash: snapshot.fingerprint.sourceSha256,
              })),
            )}
            pendingScripts={scriptTrustPrompt.snapshots.map((snapshot) => ({
              id: snapshot.assetId,
              name: snapshot.name,
              path: snapshot.path,
              hash: snapshot.fingerprint.sourceSha256,
              language: snapshot.language,
              provenance: describeScriptProvenance(snapshot.provenance),
              source: snapshot.source,
            }))}
            onResolve={resolveScriptTrustPrompt}
          />
        ) : null}
        <input
          ref={globalModelImportInputRef}
          type="file"
          accept={ASSET_IMPORT_ACCEPT}
          multiple
          className="hidden"
          aria-label="Modelまたは3DアセットをImport"
          onChange={(event) => {
            handleQueueFiles(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = "";
          }}
        />

        <main
          ref={mainRef}
          className="relative grid min-h-0 flex-1 overflow-hidden"
          style={{
            gridTemplateColumns: `${hierarchyTrack} minmax(360px, 1fr) ${inspectorTrack}`,
            gridTemplateRows: `minmax(240px, 1fr) ${assetsTrack}`,
          }}
        >
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
            onTogglePlay={() => executeCommand("play.toggle")}
            onTransformModeChange={(mode) => {
              if (!renderedReadOnly) setTransformMode(mode);
            }}
            onToggleTransformSpace={() => {
              if (!renderedReadOnly) {
                executeCommand("transform.toggle-space");
              }
            }}
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
            scriptRuntime={scriptViewportRuntime}
            frameSelectionRequest={frameSelectionRequest}
            exitFocusRequest={exitFocusRequest}
            focusedEntity={focusedEntity}
            onFocusChange={setFocusedEntity}
            onExitFocus={() => executeCommand("view.exit-focus")}
            onViewportFileDrop={() => setNotice("外部Assetは下のAssets Browserへドロップしてください")}
            onPlayDropAttempt={() => setNotice("Play中もHierarchyまたは追加メニューからEntityを配置できます")}
            onDropRejected={setNotice}
            onOptimizeColliders={handleOptimizeColliders}
            thumbnailCaptureRequest={thumbnailCaptureRequest}
            onThumbnailCaptured={onThumbnailCaptured}
            onThumbnailCaptureError={onThumbnailCaptureError}
          />
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
            onColliderChange={handleColliderChange}
            onRigidBodyChange={handleRigidBodyChange}
            onAutoFitCollider={handleAutoFitCollider}
            onRemoveCollider={handleRemoveCollider}
            onRemoveRigidBody={handleRemoveRigidBody}
            onLightChange={handleLightChange}
            onTextChange={handleTextChange}
            onAnimationChange={handleAnimationChange}
            onAudioSourceChange={handleAudioSourceChange}
            onSelectAsset={handleSelectAsset}
            onOpenInteractivity={(assetId) =>
              executeCommand("asset.edit-interactivity", { assetId })
            }
            scriptContracts={scriptEditor.contracts}
            scriptEntityOptions={scriptEntityOptions}
            onUpdateScriptComponent={handleUpdateScriptComponent}
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
            modelReimportState={
              modelReimportFeedback?.assetId === assetSelection
                ? modelReimportFeedback.state
                : { phase: "idle" }
            }
            onParticleChange={handleParticleChange}
            onTextureChange={handleTextureChange}
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
                setNotice("Prefab source Entityが見つかりません");
                return;
              }
              setAssetSelection(null);
              setSceneSettingsOpen(false);
              setSceneSelection({ kind: "entity", id: entityId });
              setNotice("Prefabの編集元Hierarchyを開きました");
            }}
            onUpdatePrefab={handleUpdatePrefab}
            onSetEntitiesEnabled={handleSetSelectedEntitiesEnabled}
            onSetMeshShadow={handleSetSelectedMeshShadow}
            onSetLightShadow={handleSetSelectedLightShadow}
            onApplyMaterialPatch={handleApplySelectedMaterialPatch}
          />
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
              if (!projectPath) {
                setNotice(
                  "プロジェクトを保存してからAssetsをエクスプローラーで開いてください",
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
                    ? "アセットの保存場所をエクスプローラーで表示しました"
                    : "Assetsフォルダーをエクスプローラーで開きました",
                );
              } catch {
                setNotice(
                  sourceRelativePath
                    ? "アセットの保存場所をエクスプローラーで表示できませんでした。ソースファイルを確認してください"
                    : "Assetsフォルダーをエクスプローラーで開けませんでした。プロジェクトの保存場所を確認してください",
                );
              }
            }}
            externalOperationLockReason={
              assetImportPanelAvailability.disabledReason
            }
          />
          <MaterialThumbnailGenerationQueue
            assets={bundle.assets}
            projectPath={projectPath}
            enabled={renderedEditorMode === "edit" && !importBusy}
            onGenerated={handleAssetThumbnailGenerated}
            onFailed={handleMaterialThumbnailFailure}
          />
          <EnvironmentTextureThumbnailGenerationQueue
            assets={bundle.assets}
            projectPath={projectPath}
            enabled={renderedEditorMode === "edit" && !importBusy}
            onGenerated={handleAssetThumbnailGenerated}
            onFailed={handleEnvironmentTextureThumbnailFailure}
          />
          <EditorUtilityRail
            commands={resolvedCommands}
            sceneSettingsOpen={sceneSettingsOpen}
            onToggleSceneSettings={() =>
              setSceneSettingsOpen((current) => !current)
            }
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
          />
          <ExternalAssetStoreDialog
            open={externalStoreOpen}
            projectPath={projectPath}
            projectKind={projectKind}
            disabledReason={
              renderedReadOnly
                ? "Playを停止してから外部アセットを追加してください"
                : assetImportPanelAvailability.disabledReason
            }
            onClose={() => setExternalStoreOpen(false)}
            onInstalled={handleExternalStoreInstalled}
            onAddOpenBrush={handleAddOpenBrushMaterial}
            onAddOfficialComponent={handleAddOfficialComponent}
          />
          {interactivityEditorAssetId &&
          bundle.assets.assets[interactivityEditorAssetId]?.kind === "interactivity" ? (
            <InteractivityGraphEditor
              key={interactivityEditorAssetId}
              asset={bundle.assets.assets[interactivityEditorAssetId]}
              materials={Object.values(bundle.assets.assets).filter(
                (asset) => asset.kind === "material",
              )}
              readOnly={renderedReadOnly}
              onSave={handleSaveInteractivityAsset}
              onClose={() => setInteractivityEditorAssetId(null)}
            />
          ) : null}
          {scriptEditorAsset ? (
            <ScriptEditorDialog
              key={scriptEditorAsset.id}
              asset={scriptEditorAsset}
              source={scriptEditor.state.source}
              loading={scriptEditor.state.loading}
              error={scriptEditor.state.error}
              playing={renderedEditorMode === "play"}
              runtime={scriptRuntimeReport}
              onSave={scriptEditor.save}
              onDirtyChange={handleScriptEditorDirtyChange}
              onClose={scriptEditor.close}
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
            aria-label="Hierarchy panelの幅を変更"
            title={commandTitle("Hierarchy幅を変更", "ResizePanel.Hierarchy")}
            onPointerDown={(event) => beginResize("hierarchy", event)}
            className="absolute bottom-0 top-0 z-40 w-1 cursor-col-resize bg-transparent hover:bg-violet-400/70 focus:bg-violet-400/70"
            style={{ left: `calc(${hierarchyTrack} - 2px)` }}
          />
          {deleteDialog ? (
            <AssetDeleteDialog
              target={deleteDialog}
              onCancel={() => setDeleteDialog(null)}
              onConfirm={confirmAssetLibraryDelete}
            />
          ) : null}
          {pendingMaterialAssignment ? (
            <MaterialSlotAssignmentDialog
              entityName={pendingMaterialAssignment.entityName}
              materialName={pendingMaterialAssignment.materialName}
              slots={pendingMaterialAssignment.slots}
              onCancel={() => {
                setPendingMaterialAssignment(null);
                setNotice("Materialの適用を取り消しました");
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
            aria-label="Inspector panelの幅を変更"
            title={commandTitle("Inspector幅を変更", "ResizePanel.Inspector")}
            onPointerDown={(event) => beginResize("inspector", event)}
            className="absolute bottom-0 top-0 z-40 w-1 cursor-col-resize bg-transparent hover:bg-violet-400/70 focus:bg-violet-400/70"
            style={{ right: `calc(${inspectorTrack} - 2px)` }}
          />
          <button
            type="button"
            aria-label="Assets panelの高さを変更"
            title={commandTitle("Assets高さを変更", "ResizePanel.Assets")}
            onPointerDown={(event) => beginResize("assets", event)}
            className="absolute z-40 h-1 cursor-row-resize bg-transparent hover:bg-violet-400/70 focus:bg-violet-400/70"
            style={{
              bottom: `calc(${assetsTrack} - 2px)`,
              left: hierarchyTrack,
              right: inspectorTrack,
            }}
          />
        </main>
      </div>
    </div>
  );
}
