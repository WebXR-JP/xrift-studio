import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import {
  createTerrainFromPreset,
  getTerrainGeometry,
  getTerrainPreset,
  getTransform,
} from "../../lib/visual-editor";
import { BUILTIN_ASSET_IDS, type PrototypeVisualProject } from "../../lib/visual-editor/prototype-project";
import {
  addTerrainEntity,
  applyTerrainBrushToScene,
  resampleTerrainInScene,
} from "../../lib/visual-editor/scene-document";
import {
  commitEditorHistory,
  replaceEditorHistoryPresent,
  type EditorHistory,
} from "../../lib/visual-editor/editor-history";
import type {
  TerrainBrushOperation,
  TerrainGeometryOptions,
} from "../../lib/visual-editor/terrain";
import type { EditorMode } from "./types";

export type TerrainEditorSnapshot = {
  bundle: PrototypeVisualProject;
  sceneSelection: { kind: "entity"; id: string } | null;
  assetSelection: string | null;
};

type TerrainSaveStatus = "dirty" | "saving" | "saved" | "error" | "unavailable";

type TerrainStrokeTransaction = {
  entityId: string;
  componentId: string;
  before: TerrainEditorSnapshot;
  saveStatus: TerrainSaveStatus;
};

type TerrainAuthoringOptions = {
  editorMode: EditorMode;
  importBusy: boolean;
  historyPresent: TerrainEditorSnapshot;
  setHistory: Dispatch<SetStateAction<EditorHistory<TerrainEditorSnapshot>>>;
  notify: (message: string) => void;
  markDirty: () => void;
  touchProject: (bundle: PrototypeVisualProject) => PrototypeVisualProject;
  saveStatus: TerrainSaveStatus;
  setSaveStatus: Dispatch<SetStateAction<TerrainSaveStatus>>;
  bundleRef: { current: PrototypeVisualProject };
  lastSavedBundleRef: { current: PrototypeVisualProject | null };
};

const TERRAIN_BRUSH_SUCCESS_MESSAGE: Record<
  TerrainBrushOperation["kind"],
  string
> = {
  raise: "地形を盛り上げました",
  lower: "地形を掘りました",
  flatten: "地形をならしました",
  smooth: "地形を滑らかにしました",
  stamp: "地形スタンプを適用しました",
  "hole-add": "Terrainに穴を開けました",
  "hole-remove": "Terrainの穴を埋めました",
};

/** Keeps Terrain edits as one undoable, saved authoring transaction. */
export function useTerrainAuthoring({
  editorMode,
  importBusy,
  historyPresent,
  setHistory,
  notify,
  markDirty,
  touchProject,
  saveStatus,
  setSaveStatus,
  bundleRef,
  lastSavedBundleRef,
}: TerrainAuthoringOptions) {
  const strokeRef = useRef<TerrainStrokeTransaction | null>(null);
  const handleCreateTerrain = useCallback((presetId?: string) => {
    if (editorMode !== "edit") {
      notify("地形は編集モードで作成してください");
      return;
    }
    if (importBusy) {
      notify("アセットのインポート完了後に地形を作成してください");
      return;
    }
    setHistory((current) => {
      const preferredMaterialId = BUILTIN_ASSET_IDS.material.green;
      const materialAssetId =
        current.present.bundle.assets.assets[preferredMaterialId]?.kind === "material"
          ? preferredMaterialId
          : Object.values(current.present.bundle.assets.assets).find(
              (asset) => asset.kind === "material",
            )?.id;
      if (!materialAssetId) {
        notify("地形に使うマテリアルがありません");
        return current;
      }
      // A preset arrives shaped and planted. Without one the author still gets
      // the flat plate they can sculpt from.
      const preset = presetId ? getTerrainPreset(presetId) : undefined;
      const geometry = preset ? createTerrainFromPreset(preset) : undefined;
      // Two Terrains at the origin are two nearly coincident surfaces, and the
      // depth buffer cannot separate them: the overlap tears into moire rings
      // that read as a rendering fault rather than as "you placed two". Setting
      // the new one beside whatever is already there keeps both readable, and
      // the author can still drag it wherever they meant.
      const position = nextTerrainPosition(
        current.present.bundle.scene,
        geometry?.width ?? DEFAULT_TERRAIN_SPAN,
      );
      const created = addTerrainEntity(
        current.present.bundle.scene,
        current.present.bundle.assets,
        materialAssetId,
        geometry
          ? { ...geometry, name: preset?.label, position }
          : { position },
      );
      if (!created) {
        notify("現在のSceneに地形を作成できませんでした");
        return current;
      }
      markDirty();
      notify("地形を作成しました。インスペクターで形を整えられます");
      return commitEditorHistory(current, {
        ...current.present,
        bundle: touchProject({
          ...current.present.bundle,
          scene: created.scene,
        }),
        sceneSelection: { kind: "entity", id: created.entityId },
        assetSelection: null,
      });
    });
  }, [editorMode, importBusy, markDirty, notify, setHistory, touchProject]);

  const handleTerrainBrush = useCallback(
    (
      entityId: string,
      componentId: string,
      operation: TerrainBrushOperation,
    ) => {
      if (editorMode !== "edit" || importBusy) {
        notify("地形ブラシは編集モードでのみ使えます");
        return;
      }
      setHistory((current) => {
        const scene = applyTerrainBrushToScene(
          current.present.bundle.scene,
          entityId,
          operation,
          componentId,
        );
        if (scene === current.present.bundle.scene) {
          notify("地形を変更できませんでした。対象とブラシの位置を確認してください");
          return current;
        }
        markDirty();
        notify(TERRAIN_BRUSH_SUCCESS_MESSAGE[operation.kind]);
        return commitEditorHistory(current, {
          ...current.present,
          bundle: touchProject({ ...current.present.bundle, scene }),
          sceneSelection: { kind: "entity", id: entityId },
          assetSelection: null,
        });
      });
    },
    [editorMode, importBusy, markDirty, notify, setHistory, touchProject],
  );

  const handleTerrainSettings = useCallback(
    (
      entityId: string,
      componentId: string,
      options: Pick<TerrainGeometryOptions, "width" | "depth" | "resolution">,
    ) => {
      if (editorMode !== "edit" || importBusy) {
        notify("地形設定は編集モードでのみ変更できます");
        return;
      }
      setHistory((current) => {
        const scene = resampleTerrainInScene(
          current.present.bundle.scene,
          entityId,
          options,
          componentId,
        );
        if (scene === current.present.bundle.scene) return current;
        markDirty();
        notify("地形のサイズとサンプルを更新しました");
        return commitEditorHistory(current, {
          ...current.present,
          bundle: touchProject({ ...current.present.bundle, scene }),
          sceneSelection: { kind: "entity", id: entityId },
          assetSelection: null,
        });
      });
    },
    [editorMode, importBusy, markDirty, notify, setHistory, touchProject],
  );

  const handleTerrainStrokeStart = useCallback(
    (entityId: string, componentId: string) => {
      if (editorMode !== "edit" || importBusy || strokeRef.current) return false;
      strokeRef.current = {
        entityId,
        componentId,
        before: historyPresent,
        saveStatus: saveStatus,
      };
      return true;
    },
    [editorMode, historyPresent, importBusy, saveStatus],
  );

  const handleTerrainStroke = useCallback(
    (entityId: string, componentId: string, operation: TerrainBrushOperation) => {
      const transaction = strokeRef.current;
      if (
        editorMode !== "edit" ||
        importBusy ||
        !transaction ||
        transaction.entityId !== entityId ||
        transaction.componentId !== componentId
      ) {
        return;
      }
      setHistory((current) => {
        const scene = applyTerrainBrushToScene(
          current.present.bundle.scene,
          entityId,
          operation,
          componentId,
        );
        if (scene === current.present.bundle.scene) return current;
        const bundle = { ...current.present.bundle, scene };
        bundleRef.current = bundle;
        setSaveStatus("dirty");
        return replaceEditorHistoryPresent(current, {
          ...current.present,
          bundle,
          sceneSelection: { kind: "entity", id: entityId },
          assetSelection: null,
        });
      });
    },
    [bundleRef, editorMode, importBusy, setHistory, setSaveStatus],
  );

  const finishTerrainStroke = useCallback(
    (entityId: string, cancelled: boolean) => {
      const transaction = strokeRef.current;
      if (!transaction || transaction.entityId !== entityId) return;
      strokeRef.current = null;
      setHistory((current) => {
        if (cancelled || current.present.bundle.scene === transaction.before.bundle.scene) {
          bundleRef.current = transaction.before.bundle;
          setSaveStatus(
            lastSavedBundleRef.current === transaction.before.bundle
              ? "saved"
              : transaction.saveStatus,
          );
          if (cancelled) notify("地形ブラシの編集を取り消しました");
          return replaceEditorHistoryPresent(current, transaction.before);
        }
        const committed = {
          ...current.present,
          bundle: touchProject(current.present.bundle),
        };
        bundleRef.current = committed.bundle;
        setSaveStatus("dirty");
        notify("地形ブラシをSceneへ反映しました（Undo 1件）");
        return commitEditorHistory(
          { ...current, present: transaction.before },
          committed,
        );
      });
    },
    [bundleRef, lastSavedBundleRef, notify, setHistory, setSaveStatus, touchProject],
  );

  const handleTerrainStrokeEnd = useCallback(
    (entityId: string) => finishTerrainStroke(entityId, false),
    [finishTerrainStroke],
  );
  const handleTerrainStrokeCancel = useCallback(
    (entityId: string) => finishTerrainStroke(entityId, true),
    [finishTerrainStroke],
  );

  return {
    handleCreateTerrain,
    handleTerrainBrush,
    handleTerrainSettings,
    handleTerrainStrokeStart,
    handleTerrainStroke,
    handleTerrainStrokeEnd,
    handleTerrainStrokeCancel,
    strokeActiveRef: strokeRef,
  };
}


/** Fallback footprint when a plain Terrain is created without a preset. */
const DEFAULT_TERRAIN_SPAN = 20;

/**
 * Finds free ground for a new Terrain.
 *
 * Terrains are laid out along +X, each clear of the last, so repeatedly trying
 * presets builds a row to compare rather than a stack that z-fights.
 */
function nextTerrainPosition(
  scene: PrototypeVisualProject["scene"],
  width: number,
): [number, number, number] {
  let rightEdge: number | null = null;
  for (const entity of Object.values(scene.entities)) {
    for (const component of entity.components) {
      if (component.type !== "mesh") continue;
      const existing = getTerrainGeometry(component);
      if (!existing) continue;
      const transform = getTransform(entity);
      const centre = transform?.position?.[0] ?? 0;
      const edge = centre + existing.width / 2;
      rightEdge = rightEdge === null ? edge : Math.max(rightEdge, edge);
    }
  }
  if (rightEdge === null) return [0, 0, 0];
  // A gap, so the two footprints never touch even after sculpting the edges.
  return [rightEdge + width / 2 + 4, 0, 0];
}
