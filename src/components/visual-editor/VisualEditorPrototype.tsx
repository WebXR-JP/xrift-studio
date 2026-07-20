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
  BUILTIN_ASSET_IDS,
  analyzeAssetDeletion,
  analyzeAssetFolderDeletion,
  addDefaultParticleAsset,
  autoFitBoxCollider,
  commitAssetImportPlanToDisk,
  createAssetImportPlan,
  addEditorComponent,
  addAssetFolder,
  addPrefabAsset,
  addBuiltinPrimitiveEntity,
  assignMaterialToMeshSlots,
  commitEditorHistory,
  createEditorHistory,
  createDocumentId,
  createEmptyEntity,
  createPrefabDocument,
  createPrototypeProject,
  getBuiltinPrimitiveCreation,
  getColliderAutoFitBounds,
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
  listBuiltinPrefabRecipes,
  moveLibraryAsset,
  moveLibraryFolder,
  pasteEntityHierarchy,
  removeXriftComponent,
  renameAsset,
  renameAssetFolder,
  renameEntity,
  resolveEditorCommands,
  shortcutForCommand,
  redoEditorHistory,
  replaceEditorHistoryPresent,
  reparentEntityHierarchy,
  reimportModelAssetFromDisk,
  undoEditorHistory,
  updateEntityTransform,
  updateColliderComponent,
  updateMaterialAsset,
  updateModelAsset,
  updateParticleAsset,
  updateTextureAsset,
  updateXriftComponent,
  type MaterialAsset,
  type ColliderPatch,
  type MaterialAssetPatch,
  type ModelAssetPatch,
  type ModelReimportProgress,
  type EditorCommandId,
  type EntityClipboard,
  type ParticlePropertiesPatch,
  type PrototypeVisualProject,
  type SceneSettings,
  type TextureAssetPatch,
  type TransformPatch,
  type UpdateXriftComponentPatch,
  type Vec3,
  type VisualProjectKind,
} from "../../lib/visual-editor";
import { AssetsPanel } from "./AssetsPanel";
import {
  hasActiveAssetImport,
  resolveAssetOperationAvailability,
} from "./asset-operation-lock";
import {
  AssetDeleteDialog,
  type AssetDeleteDialogTarget,
} from "./AssetDeleteDialog";
import { EditorCreateMenu } from "./EditorCreateMenu";
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
import { SceneViewport } from "./SceneViewport";
import { roundTo } from "./editor-utils";
import type {
  EditorMode,
  EditorSelection,
  PendingImport,
  TransformMode,
  TransformSpace,
} from "./types";

const SUPPORTED_MODEL_FILE = /\.(glb|gltf)$/i;
const SUPPORTED_TEXTURE_FILE = /\.(png|jpe?g|webp|ktx2)$/i;

type SceneSelection = Extract<EditorSelection, { kind: "entity" }> | null;

type EditorSessionSnapshot = {
  bundle: PrototypeVisualProject;
  sceneSelection: SceneSelection;
  assetSelection: string | null;
};

type SaveStatus = "dirty" | "saving" | "saved" | "error";

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

type EditorCommandPayload = {
  creationId?: string;
  entityId?: string;
  assetId?: string;
  folderId?: string;
  parentEntityId?: string | null;
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

function sanitizedImportMessage(error: unknown, projectPath: string): string {
  let message = error instanceof Error ? error.message : String(error);
  const pathVariants = [projectPath, projectPath.replace(/\\/g, "/")].filter(
    (value, index, values) => value && values.indexOf(value) === index,
  );
  for (const path of pathVariants) {
    message = message.split(path).join("プロジェクト");
  }
  return message.replace(/data:[^\s]+/gi, "[アセットデータ]");
}

function ToolButton({
  active,
  disabled,
  shortcut,
  label,
  command,
  icon,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  shortcut: string;
  label: string;
  command: string;
  icon: "move" | "rotate" | "scale";
  onClick: () => void;
}) {
  const Icon = EDITOR_ICONS[icon];
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      title={commandTitle(label, command, shortcut)}
      className={`flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-violet-600 text-white"
          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
      }`}
    >
      <Icon size={13} aria-hidden="true" />
      <kbd className="rounded bg-black/10 px-1 font-mono text-xs">{shortcut}</kbd>
      {label}
    </button>
  );
}

export function VisualEditorPrototype({
  projectKind,
  onBack,
  projectName,
  projectPath,
  initialBundle: providedInitialBundle,
  onSave,
  onUpload,
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
  const sceneSelection = history.present.sceneSelection;
  const assetSelection = history.present.assetSelection;
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(
    projectPath ? "saved" : "dirty",
  );
  const clipboardRef = useRef<EntityClipboard | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget>(null);
  const [deleteDialog, setDeleteDialog] = useState<AssetDeleteDialogTarget | null>(null);
  const [pendingMaterialAssignment, setPendingMaterialAssignment] =
    useState<PendingMaterialAssignment>(null);
  const [modelReimportFeedback, setModelReimportFeedback] =
    useState<ModelReimportFeedback>(null);
  const [activeAssetFolderId, setActiveAssetFolderId] = useState<string | null>(null);
  const [frameSelectionRequest, setFrameSelectionRequest] = useState(0);
  const resolvedCommands = useMemo(() => resolveEditorCommands(), []);
  const mainRef = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState<VisualEditorLayout>({
    ...loadEditorLayout(initialLayout),
  });
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [transformSpace, setTransformSpace] = useState<TransformSpace>("world");
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [sceneSettingsOpen, setSceneSettingsOpen] = useState(false);
  const [pendingImports, setPendingImports] = useState<QueuedAssetImport[]>([]);
  const importQueueRef = useRef<QueuedAssetImport[]>([]);
  const importRunningRef = useRef(false);
  const assetOperationRef = useRef<{
    kind: "asset-import" | "model-reimport";
    token: symbol;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    "SceneのEntityとAssetを別々に選択できます。CreateからPrimitiveを配置してください",
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

  const setSceneSelection = useCallback((selection: SceneSelection) => {
    setHistory((current) =>
      replaceEditorHistoryPresent(current, {
        ...current.present,
        sceneSelection: selection,
      }),
    );
  }, []);

  const setAssetSelection = useCallback((assetId: string | null) => {
    setHistory((current) =>
      replaceEditorHistoryPresent(current, {
        ...current.present,
        assetSelection: assetId,
      }),
    );
  }, []);

  useEffect(() => {
    setHistory(createEditorHistory(createInitialSnapshot(), 80));
    setSaveStatus(projectPath ? "saved" : "dirty");
    setEditorMode("edit");
    clipboardRef.current = null;
    setRenameTarget(null);
    setDeleteDialog(null);
    setPendingMaterialAssignment(null);
    setModelReimportFeedback(null);
    setActiveAssetFolderId(null);
    setFrameSelectionRequest(0);
    setSceneSettingsOpen(false);
    importQueueRef.current = [];
    setPendingImports([]);
    setImportError(null);
    setNotice("SceneのEntityとAssetを別々に選択できます。CreateからPrimitiveを配置してください");
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

  const readOnly = editorMode === "play";
  const modelReimportBusy = Boolean(
    modelReimportFeedback &&
      (modelReimportFeedback.state.phase === "reading" ||
        modelReimportFeedback.state.phase === "processing" ||
        modelReimportFeedback.state.phase === "committing"),
  );
  const importBusy =
    modelReimportBusy ||
    pendingImports.some((entry) => importIsActive(entry.status));
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
      setNotice("シーン設定を更新しました。保存するとWorld生成にも反映されます");
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
    if (editorMode !== "edit" || !clipboardRef.current) return;
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
    if (editorMode !== "edit" || !entityId) return;
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
    const entityId = requestedEntityId ?? sceneSelection?.id;
    if (editorMode !== "edit" || !entityId) return;
    const source = bundle.scene.entities[entityId];
    if (!source) return;
    const scene = deleteEntityHierarchy(bundle.scene, [source.id]);
    if (scene === bundle.scene) return;
    setBundle(touchProject({ ...bundle, scene }));
    setSceneSelection(null);
    setAssetSelection(null);
    setNotice(`「${source.name}」を削除しました`);
  }, [bundle, editorMode, sceneSelection?.id, setAssetSelection, setBundle, setSceneSelection]);

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
      if (editorMode !== "edit" || importBusy) {
        setNotice(
          editorMode !== "edit"
            ? "Playを停止してからXRift Componentを配置してください"
            : "アセットのインポート完了後にXRift Componentを配置してください",
        );
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
    (entityId: string, parentEntityId: string | null) => {
      if (editorMode !== "edit" || importBusy) {
        setNotice(
          editorMode !== "edit"
            ? "Playを停止してからHierarchyを移動してください"
            : "アセットのインポート完了後にHierarchyを移動してください",
        );
        return;
      }
      setHistory((current) => {
        const decision = getEntityReparentDecision(
          current.present.bundle.scene,
          entityId,
          parentEntityId,
        );
        if (!decision.allowed) {
          const message =
            decision.reason === "descendant-parent" ||
            decision.reason === "same-entity"
              ? "Entityを自分自身または子Entityへ移動できません"
              : decision.reason === "unchanged-parent"
                ? "Entityはすでにこの場所にあります"
                : "移動先のEntityが見つかりません";
          setNotice(message);
          return current;
        }
        const scene = reparentEntityHierarchy(
          current.present.bundle.scene,
          entityId,
          parentEntityId,
        );
        if (scene === current.present.bundle.scene) return current;
        const entityName = scene.entities[entityId]?.name ?? "Entity";
        const parentName = parentEntityId
          ? scene.entities[parentEntityId]?.name ?? "Entity"
          : "Scene Root";
        setSaveStatus("dirty");
        setNotice(`「${entityName}」を${parentName}へ移動しました`);
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
      if (editorMode !== "edit" || importBusy) {
        setNotice(
          editorMode !== "edit"
            ? "Playを停止してからModel / Prefab / Particleを配置してください"
            : "アセットのインポート完了後にModel / Prefab / Particleを配置してください",
        );
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
      if (editorMode !== "edit") {
        setNotice("Playを停止してからPrimitiveを配置してください");
        return;
      }
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
      if (editorMode !== "edit" || importBusy) {
        setNotice(
          editorMode !== "edit"
            ? "Playを停止してからEntityを作成してください"
            : "アセットのインポート完了後にEntityを作成してください",
        );
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
      if (editorMode !== "edit" || importBusy) return;
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

  const handleTransformChange = useCallback(
    (entityId: string, patch: TransformPatch) => {
      if (editorMode !== "edit") return;
      updateScene((scene) => updateEntityTransform(scene, entityId, patch));
    },
    [editorMode, updateScene],
  );

  const handleGizmoCommit = useCallback(
    (entityId: string, patch: TransformPatch) => {
      if (editorMode !== "edit") return;
      updateScene((scene) => updateEntityTransform(scene, entityId, patch));
      setNotice("ギズモの変更をシーンへ反映しました");
    },
    [editorMode, updateScene],
  );

  const handleRenameEntity = useCallback(
    (entityId: string, name: string) => {
      if (editorMode !== "edit") return;
      updateScene((scene) => renameEntity(scene, entityId, name));
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
            ...(patch.materialBindings
              ? { materialBindings: patch.materialBindings.map((binding) => ({ ...binding })) }
              : {}),
            ...(typeof patch.castShadow === "boolean" ? { castShadow: patch.castShadow } : {}),
            ...(typeof patch.receiveShadow === "boolean" ? { receiveShadow: patch.receiveShadow } : {}),
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
      setNotice("Mesh Rendererのマテリアルスロットと影設定をシーンへ反映しました");
    },
    [editorMode, updateScene],
  );

  const handleColliderChange = useCallback(
    (entityId: string, componentId: string, patch: ColliderPatch) => {
      if (editorMode !== "edit") return;
      updateScene((scene) =>
        updateColliderComponent(scene, entityId, patch, componentId),
      );
      setNotice("Collider設定をSceneへ反映しました");
    },
    [editorMode, updateScene],
  );

  const handleAutoFitCollider = useCallback(
    (entityId: string, componentId: string) => {
      if (editorMode !== "edit") return;
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
    [bundle.assets, bundle.scene, editorMode, updateScene],
  );

  const handleRemoveCollider = useCallback(
    (entityId: string, componentId: string) => {
      if (editorMode !== "edit") return;
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
    [editorMode, updateScene],
  );

  const handleParticleEmitterChange = useCallback(
    (
      entityId: string,
      componentId: string,
      patch: ParticleEmitterInspectorPatch,
    ) => {
      if (editorMode !== "edit") return;
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
      setNotice("Particle Emitterの設定を更新しました");
    },
    [bundle.assets.assets, editorMode, updateScene],
  );

  const handleRemoveParticleEmitter = useCallback(
    (entityId: string, componentId: string) => {
      if (editorMode !== "edit") return;
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
      setNotice("Particle Emitterを削除しました");
    },
    [editorMode, updateScene],
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
      const mesh = entity?.components.find(
        (component) => component.id === target.meshId && component.type === "mesh",
      );
      if (!entity || mesh?.type !== "mesh") {
        setNotice("Materialの適用先Meshが見つかりません");
        return;
      }
      const slots = target.slots.map((slot) => {
        const binding = mesh.materialBindings.find(
          (candidate) => candidate.slot === slot.slot,
        );
        const currentMaterialId =
          binding?.materialAssetId ?? slot.defaultMaterialAssetId;
        const currentMaterial = currentMaterialId
          ? bundle.assets.assets[currentMaterialId]
          : undefined;
        return {
          ...slot,
          currentMaterialName:
            currentMaterial?.kind === "material"
              ? currentMaterial.name
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
      if (editorMode !== "edit") return;
      setBundle((current) => {
        const assets = updateMaterialAsset(current.assets, assetId, patch);
        if (assets === current.assets) {
          setNotice("Material値は変更されませんでした。不正値は元の値を保持します");
          return current;
        }
        setNotice("Material IRを更新し、参照中のMesh previewへ反映しました");
        return touchProject({ ...current, assets });
      });
    },
    [editorMode],
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
        setNotice("Modelを再インポートする前にプロジェクトを保存してください");
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
          assets: {
            ...current.present.bundle.assets,
            assets: {
              ...current.present.bundle.assets.assets,
              [assetId]: reimportedAsset,
            },
          },
        });
        bundleRef.current = nextBundle;
        setSaveStatus("dirty");
        setModelReimportFeedback({
          assetId,
          state: {
            phase: "succeeded",
            message: "Modelを再インポートしました。保存すると変更が確定します",
          },
        });
        setNotice(`「${reimportedAsset.name}」を再インポートしました`);
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
      if (editorMode !== "edit") return;
      setBundle((current) => {
        const assets = updateParticleAsset(current.assets, assetId, patch);
        if (assets === current.assets) return current;
        setNotice("Particle設定を更新し、参照中のEmitterへ反映しました");
        return touchProject({ ...current, assets });
      });
    },
    [editorMode, setBundle],
  );

  const handleCreateMaterial = useCallback(() => {
    if (editorMode !== "edit") return;
    const assetId = createDocumentId("material");
    setBundle((current) => {
      const count = Object.values(current.assets.assets).filter(
        (asset) => asset.kind === "material" && asset.source.kind === "document",
      ).length;
      const asset: MaterialAsset = {
        id: assetId,
        name: `新規マテリアル ${count + 1}`,
        kind: "material",
        status: "ready",
        source: { kind: "document" },
        properties: normalizeMaterialProperties({
          pbrMetallicRoughness: {
            baseColorFactor: [0.82, 0.84, 0.9, 1],
            metallicFactor: 0,
            roughnessFactor: 0.65,
          },
        }),
      };
      return touchProject({
        ...current,
        assets: {
          ...current.assets,
          assets: { ...current.assets.assets, [assetId]: asset },
        },
      });
    });
    setAssetSelection(assetId);
    setNotice("標準glTFマテリアルを作成し、Asset Inspectorで開きました");
  }, [editorMode]);

  const handleCreateParticle = useCallback(() => {
    if (editorMode !== "edit") return;
    const assetId = createDocumentId("particle");
    setBundle((current) => {
      const count = Object.values(current.assets.assets).filter(
        (asset) => asset.kind === "particle" && asset.source.kind === "document",
      ).length;
      const folderId =
        activeAssetFolderId && current.assets.folders?.[activeAssetFolderId]
          ? activeAssetFolderId
          : null;
      const added = addDefaultParticleAsset(current.assets, {
        id: assetId,
        name: `新規Particle ${count + 1}`,
        folderId,
      });
      return added.added
        ? touchProject({ ...current, assets: added.manifest })
        : current;
    });
    setAssetSelection(assetId);
    setNotice("Particleを作成し、Asset Inspectorで開きました");
  }, [activeAssetFolderId, editorMode, setAssetSelection, setBundle]);

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

  const handleAddComponent = useCallback(
    (entityId: string, componentDefinitionId: string) => {
      if (editorMode !== "edit") return;
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
        );
        if (!result.added) {
          const reason =
            result.reason === "duplicate"
              ? "同じComponentは重複追加できません"
              : result.reason === "project-kind"
                ? "このProject種別では追加できません"
                : result.reason === "dependency-missing"
                  ? "必要なMeshまたはAssetがありません"
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
    [editorMode, projectKind, setBundle],
  );

  const handleUpdateXriftComponent = useCallback(
    (
      entityId: string,
      componentId: string,
      patch: UpdateXriftComponentPatch,
    ) => {
      if (editorMode !== "edit") return;
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
          error?.message ?? "XRift Componentの設定をシーンへ反映しました",
        );
        return result.scene;
      });
    },
    [editorMode, projectKind, updateScene],
  );

  const handleRemoveXriftComponent = useCallback(
    (entityId: string, componentId: string) => {
      if (editorMode !== "edit") return;
      updateScene((scene) => {
        const result = removeXriftComponent(scene, entityId, componentId);
        if (!result.changed) {
          setNotice(
            result.diagnostics[0]?.message ??
              "XRift Componentを削除できませんでした",
          );
          return scene;
        }
        setNotice("XRift Componentを削除しました");
        return result.scene;
      });
    },
    [editorMode, updateScene],
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
            const plan = await createAssetImportPlan({
              fileName: sourceFile.name,
              bytes,
              mimeType: sourceFile.type,
              folderId,
            });
            const diagnostics = plan.diagnostics.map(
              ({ severity, code, message }) => ({ severity, code, message }),
            );
            updateImportQueue((current) =>
              current.map((entry) =>
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
            if (duplicate) {
              setHistory((current) =>
                replaceEditorHistoryPresent(current, {
                  ...current.present,
                  assetSelection: duplicate.id,
                }),
              );
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
              setNotice(`同じ内容のアセット「${duplicate.name}」は登録済みです`);
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
              const nextBundle = touchProject({
                ...current.present.bundle,
                assets: {
                  ...current.present.bundle.assets,
                  assets: {
                    ...current.present.bundle.assets.assets,
                    [importedAsset.id]: importedAsset,
                  },
                },
              });
              bundleRef.current = nextBundle;
              setSaveStatus("dirty");
              return commitEditorHistory(current, {
                ...current.present,
                bundle: nextBundle,
                assetSelection: importedAsset.id,
              });
            });
            updateImportQueue((current) =>
              current.map((entry) =>
                entry.id === queued.id
                  ? {
                      ...entry,
                      status: "succeeded",
                      progress: 100,
                      file: null,
                      assetId: importedAsset.id,
                    }
                  : entry,
              ),
            );
            setNotice(
              `「${importedAsset.name}」をインポートし、Asset Inspectorで開きました`,
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
      if (SUPPORTED_MODEL_FILE.test(file.name)) {
        accepted.push({ file, resourceKind: "model" });
      } else if (SUPPORTED_TEXTURE_FILE.test(file.name)) {
        accepted.push({ file, resourceKind: "texture" });
      }
    }
    const unsupported = files.filter(
      (file) => !SUPPORTED_MODEL_FILE.test(file.name) && !SUPPORTED_TEXTURE_FILE.test(file.name),
    );

    if (unsupported.length > 0) {
      const names = unsupported.slice(0, 3).map((file) => file.name).join("、");
      setImportError(
        `${names}${unsupported.length > 3 ? " ほか" : ""} は対象外です。GLB / GLTF / PNG / JPG / WebP / KTX2に対応します。`,
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
      setNotice("アセットをインポートする前にプロジェクトを保存してください");
    }
  }, [
    activeAssetFolderId,
    editorMode,
    processImportQueue,
    projectPath,
    updateImportQueue,
  ]);

  const enterPlayMode = useCallback(() => {
    if (importBusy) {
      setNotice("アセットのインポート完了後にPlayを開始できます");
      return;
    }
    setCreateMenuOpen(false);
    setRenameTarget(null);
    setEditorMode("play");
    setNotice(
      projectKind === "world"
        ? "World Play Modeを開始しました"
        : "Item Play Modeを開始しました",
    );
  }, [importBusy, projectKind]);

  const stopPlayMode = useCallback(() => {
    setEditorMode("edit");
    setNotice("Playを停止しました。Play中の状態を破棄し、編集カメラへ戻りました");
  }, []);

  const runSave = useCallback(async (): Promise<string | undefined> => {
    if (!onSave) {
      setNotice("Desktop shellからSaveProject callbackを指定してください");
      return undefined;
    }
    const savingBundle = bundle;
    setSaveStatus("saving");
    try {
      const savedProjectPath = await onSave(savingBundle);
      const currentWasSaved = bundleRef.current === savingBundle;
      setSaveStatus(currentWasSaved ? "saved" : "dirty");
      setNotice(
        currentWasSaved
          ? "保存しました"
          : "保存中に変更されたため、もう一度保存してください",
      );
      return typeof savedProjectPath === "string"
        ? savedProjectPath
        : projectPath;
    } catch (error) {
      setSaveStatus("error");
      setNotice(error instanceof Error ? error.message : "保存に失敗しました");
      return undefined;
    }
  }, [bundle, onSave, projectPath]);

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
          if (saveStatus === "saving") return false;
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
          return editorMode === "edit" && Boolean(clipboardRef.current);
        case "edit.duplicate":
          if (!payload.entityId && assetSelection) return false;
          handleDuplicate(payload.entityId);
          return editorMode === "edit" && Boolean(payload.entityId ?? sceneSelection?.id);
        case "edit.delete":
          if (!payload.entityId && (payload.assetId ?? assetSelection)) {
            requestDeleteAsset(payload.assetId ?? assetSelection ?? "");
            return editorMode === "edit";
          }
          handleDelete(payload.entityId);
          return editorMode === "edit" && Boolean(payload.entityId ?? sceneSelection?.id);
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
            enterPlayMode();
            return false;
          } else enterPlayMode();
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
          return editorMode === "edit" && !importBusy;
        case "entity.create-primitive":
          if (!payload.creationId) return false;
          handlePlacePrimitive(payload.creationId);
          return editorMode === "edit";
        case "entity.add-component":
          if (!payload.entityId || !payload.componentDefinitionId) return false;
          handleAddComponent(payload.entityId, payload.componentDefinitionId);
          return editorMode === "edit";
        case "entity.reparent":
          if (!payload.entityId) return false;
          handleReparentEntity(payload.entityId, payload.parentEntityId ?? null);
          return editorMode === "edit" && !importBusy;
        case "prefab.create":
          if (!payload.entityId) return false;
          handleCreatePrefab(payload.entityId);
          return editorMode === "edit";
        case "asset.create-folder":
          handleCreateAssetFolder();
          return editorMode === "edit";
        case "asset.create-material":
          handleCreateMaterial();
          return editorMode === "edit";
        case "asset.create-particle":
          handleCreateParticle();
          return editorMode === "edit";
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
      handleCreateMaterial,
      handleCreateParticle,
      handleCreatePrefab,
      handleCreateEmpty,
      handleDelete,
      handleDuplicate,
      handlePaste,
      handlePlacePrimitive,
      handleReparentEntity,
      handleRedo,
      handleUndo,
      history.future.length,
      history.past.length,
      importBusy,
      onLayoutChange,
      requestRename,
      requestDeleteAsset,
      runSave,
      runUpload,
      saveStatus,
      sceneSelection?.id,
      stopPlayMode,
    ],
  );

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (deleteDialog || pendingMaterialAssignment) return;
      if (event.repeat) return;
      const command = commandForKeyboardEvent(event, resolvedCommands);
      if (!command) return;
      if (executeCommand(command.id)) event.preventDefault();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [deleteDialog, executeCommand, pendingMaterialAssignment, resolvedCommands]);

  const shortcutLabel = useCallback(
    (commandId: EditorCommandId) =>
      shortcutForCommand(commandId, resolvedCommands) ?? "",
    [resolvedCommands],
  );

  const kindLabel = projectKind === "world" ? "World" : "Item";
  const KindIcon = projectKind === "world" ? EDITOR_ICONS.world : EDITOR_ICONS.item;
  const BackIcon = EDITOR_ICONS.back;
  const SaveIcon = EDITOR_ICONS.save;
  const UploadIcon = EDITOR_ICONS.upload;
  const CreateIcon = EDITOR_ICONS.create;
  const PlayIcon = editorMode === "play" ? EDITOR_ICONS.stop : EDITOR_ICONS.play;

  return (
    <div className="h-screen overflow-auto bg-slate-200">
      <div className="flex h-full min-h-[640px] min-w-[1024px] flex-col bg-slate-100 text-slate-900">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-300 bg-white px-3 shadow-sm">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={onBack}
              title={commandTitle("プロジェクト一覧へ戻る", "CloseVisualEditor")}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <BackIcon size={13} aria-hidden="true" />
              戻る
            </button>
            <div className="min-w-0 border-l border-slate-200 pl-2.5">
              <p className="truncate text-sm font-semibold text-slate-900">
                {bundle.project.metadata.title}
              </p>
              <p className="text-xs text-slate-500">ビジュアル制作 / シーン・アセット</p>
            </div>
            <span className="flex shrink-0 items-center gap-1 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
              <KindIcon size={12} aria-hidden="true" />
              {kindLabel}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <span className={`rounded border px-2 py-1 text-xs font-semibold ${
              saveStatus === "saved"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : saveStatus === "error"
                  ? "border-rose-300 bg-rose-50 text-rose-800"
                  : "border-amber-300 bg-amber-50 text-amber-800"
            }`}>
              {saveStatus === "saved" ? "保存済み" : saveStatus === "saving" ? "保存中" : saveStatus === "error" ? "保存エラー" : "未保存"}
            </span>
            <button
              type="button"
              disabled={saveStatus === "saving"}
              onClick={() => executeCommand("project.save")}
              title={commandTitle("ビジュアルプロジェクトを保存", "project.save", shortcutLabel("project.save"))}
              className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-50"
            >
              <SaveIcon size={13} aria-hidden="true" />
              保存
            </button>
            <button
              type="button"
              onClick={() => executeCommand("project.publish")}
              title={commandTitle("XRiftへアップロード", "project.publish", shortcutLabel("project.publish"))}
              className="flex items-center gap-1 rounded border border-violet-500 bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
            >
              <UploadIcon size={13} aria-hidden="true" />
              アップロード
            </button>
          </div>
        </header>

        <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-300 bg-slate-50 px-2.5" role="toolbar" aria-label="ビジュアルエディターのツール">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={readOnly || importBusy || history.past.length === 0}
              onClick={() => executeCommand("edit.undo")}
              aria-label="元に戻す"
              title={commandTitle("元に戻す", "edit.undo", shortcutLabel("edit.undo"))}
              className="flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <EDITOR_ICONS.undo size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={readOnly || importBusy || history.future.length === 0}
              onClick={() => executeCommand("edit.redo")}
              aria-label="やり直す"
              title={commandTitle("やり直す", "edit.redo", shortcutLabel("edit.redo"))}
              className="flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <EDITOR_ICONS.redo size={13} aria-hidden="true" />
            </button>
            <div className="relative">
              <button
                type="button"
                disabled={readOnly || importBusy}
                aria-haspopup="menu"
                aria-expanded={createMenuOpen}
                onClick={() => setCreateMenuOpen((open) => !open)}
                title={commandTitle("シーンオブジェクトを作成", "OpenCreateMenu", "Ctrl+Shift+A")}
                className="flex h-7 items-center gap-1.5 rounded border border-violet-300 bg-violet-50 px-2 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <CreateIcon size={13} aria-hidden="true" />
                Create
              </button>
              <EditorCreateMenu
                open={createMenuOpen}
                readOnly={readOnly}
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
                onAddComponent={(entityId, componentDefinitionId) =>
                  executeCommand("entity.add-component", {
                    entityId,
                    componentDefinitionId,
                  })
                }
              />
            </div>
            <ToolButton active={transformMode === "translate"} disabled={readOnly} shortcut={shortcutLabel("transform.translate")} label="移動" command="transform.translate" icon="move" onClick={() => executeCommand("transform.translate")} />
            <ToolButton active={transformMode === "rotate"} disabled={readOnly} shortcut={shortcutLabel("transform.rotate")} label="回転" command="transform.rotate" icon="rotate" onClick={() => executeCommand("transform.rotate")} />
            <ToolButton active={transformMode === "scale"} disabled={readOnly} shortcut={shortcutLabel("transform.scale")} label="拡縮" command="transform.scale" icon="scale" onClick={() => executeCommand("transform.scale")} />
            <button
              type="button"
              disabled={readOnly}
              onClick={() => executeCommand("transform.toggle-space")}
              title={commandTitle("ギズモ座標系を切り替える", "transform.toggle-space")}
              className="h-7 rounded border border-slate-300 bg-white px-2 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {transformSpace === "world" ? "World座標" : "Local座標"}
            </button>
          </div>

          <div className="flex items-center gap-2" aria-label="編集とPlayの切り替え">
            <button
              type="button"
              onClick={() => executeCommand("layout.reset")}
              aria-label="パネル配置を初期化"
              title={commandTitle(
                "パネル配置を初期化",
                "layout.reset",
                shortcutLabel("layout.reset"),
              )}
              className="rounded border border-slate-300 bg-white p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <EDITOR_ICONS.settings size={13} aria-hidden="true" />
            </button>
            <span className="text-xs text-slate-500" role="status" aria-live="polite">{notice}</span>
            <button
              type="button"
              disabled={editorMode === "edit" && importBusy}
              aria-pressed={editorMode === "play"}
              onClick={() => executeCommand("play.toggle")}
              title={commandTitle(editorMode === "play" ? "Playを停止" : importBusy ? "アセットのインポート完了後にPlayを開始" : "Playを開始", "play.toggle", shortcutLabel("play.toggle"))}
              className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold disabled:cursor-wait disabled:opacity-50 ${
                editorMode === "play"
                  ? "border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"
                  : "bg-violet-600 text-white hover:bg-violet-700"
              }`}
            >
              <PlayIcon size={14} aria-hidden="true" />
              {editorMode === "play" ? "停止" : "Play"}
            </button>
          </div>
        </div>

        <main
          ref={mainRef}
          className="relative grid min-h-0 flex-1"
          style={{
            gridTemplateColumns: `${layout.hierarchyWidth}px minmax(360px, 1fr) ${layout.inspectorWidth}px`,
            gridTemplateRows: `minmax(240px, 1fr) ${layout.assetsHeight}px`,
          }}
        >
          <HierarchyPanel
            scene={bundle.scene}
            selection={sceneSelection}
            readOnly={readOnly}
            projectKind={projectKind}
            onSelect={(selection) => {
              if (selection?.kind === "entity") {
                setSceneSettingsOpen(false);
                setSceneSelection(selection);
                setAssetSelection(null);
              }
            }}
            onAssignMaterial={handleAssignMaterial}
            onDropSceneAsset={(assetId, parentEntityId) =>
              handlePlaceSceneAsset(assetId, { parentEntityId })
            }
            onDropBuiltinPrefab={(recipeId, parentEntityId) =>
              handlePlaceBuiltinPrefab(recipeId, undefined, parentEntityId)
            }
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
            scene={bundle.scene}
            assets={bundle.assets}
            prefabs={bundle.prefabs}
            projectPath={projectPath}
            projectKind={projectKind}
            selection={sceneSelection}
            editorMode={editorMode}
            transformMode={transformMode}
            transformSpace={transformSpace}
            notice={notice}
            onSelect={(selection) => {
              if (selection?.kind === "entity") {
                setSceneSettingsOpen(false);
                setSceneSelection(selection);
                setAssetSelection(null);
              }
            }}
            onTransformCommit={handleGizmoCommit}
            onDropPrimitive={(creationId, position) =>
              handlePlacePrimitive(creationId, position)
            }
            onDropMaterial={handleAssignMaterial}
            onDropBuiltinPrefab={handlePlaceBuiltinPrefab}
            onDropSceneAsset={(assetId, position) =>
              handlePlaceSceneAsset(assetId, { position })
            }
            onCreatePrimitive={(creationId) =>
              executeCommand("entity.create-primitive", {
                creationId,
              })
            }
            frameSelectionRequest={frameSelectionRequest}
            onViewportFileDrop={() => setNotice("外部Assetは下のAssets Browserへドロップしてください")}
            onPlayDropAttempt={() => setNotice("Playを停止してからPrimitiveを配置してください")}
            onDropRejected={setNotice}
          />
          <InspectorPanel
            scene={bundle.scene}
            assets={bundle.assets}
            projectPath={projectPath}
            selectedEntityId={sceneSelection?.id ?? null}
            selectedAssetId={assetSelection}
            readOnly={readOnly}
            onRenameEntity={handleRenameEntity}
            onTransformChange={handleTransformChange}
            onMeshChange={handleMeshChange}
            onColliderChange={handleColliderChange}
            onAutoFitCollider={handleAutoFitCollider}
            onRemoveCollider={handleRemoveCollider}
            onSelectAsset={handleSelectAsset}
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
            onThumbnailChanged={() =>
              setNotice("サムネイルを更新しました。公開前の確認にも反映されます")
            }
          />
          <AssetsPanel
            assets={bundle.assets}
            projectPath={projectPath}
            projectKind={projectKind}
            editorMode={editorMode}
            selectedAssetId={assetSelection}
            pendingImports={pendingImports}
            importError={importError}
            onSelectAsset={handleSelectAsset}
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
            onRequestDeleteFolder={requestDeleteAssetFolder}
            onMoveAsset={handleMoveAsset}
            onMoveFolder={handleMoveAssetFolder}
            onPlaceBuiltinPrefab={handlePlaceBuiltinPrefab}
            onPlaceSceneAsset={(assetId) => handlePlaceSceneAsset(assetId)}
            externalOperationLockReason={
              assetImportPanelAvailability.disabledReason
            }
          />
          <button
            type="button"
            onClick={() => setSceneSettingsOpen(true)}
            aria-label="シーン設定を開く"
            title="シーン設定を開く"
            className="absolute z-40 flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
            style={{ bottom: layout.assetsHeight + 10, left: 10 }}
          >
            <EDITOR_ICONS.settings size={14} aria-hidden="true" />
            シーン設定
          </button>
          <button
            type="button"
            aria-label="Hierarchy panelの幅を変更"
            title={commandTitle("Hierarchy幅を変更", "ResizePanel.Hierarchy")}
            onPointerDown={(event) => beginResize("hierarchy", event)}
            className="absolute bottom-0 top-0 z-40 w-1 cursor-col-resize bg-transparent hover:bg-violet-400/70 focus:bg-violet-400/70"
            style={{ left: layout.hierarchyWidth - 2 }}
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
            style={{ right: layout.inspectorWidth - 2 }}
          />
          <button
            type="button"
            aria-label="Assets panelの高さを変更"
            title={commandTitle("Assets高さを変更", "ResizePanel.Assets")}
            onPointerDown={(event) => beginResize("assets", event)}
            className="absolute z-40 h-1 cursor-row-resize bg-transparent hover:bg-violet-400/70 focus:bg-violet-400/70"
            style={{
              bottom: layout.assetsHeight - 2,
              left: layout.hierarchyWidth,
              right: layout.inspectorWidth,
            }}
          />
        </main>
      </div>
    </div>
  );
}
