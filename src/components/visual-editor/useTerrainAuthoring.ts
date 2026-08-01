import { useCallback, type Dispatch, type SetStateAction } from "react";
import { BUILTIN_ASSET_IDS, type PrototypeVisualProject } from "../../lib/visual-editor/prototype-project";
import {
  addTerrainEntity,
  applyTerrainBrushToScene,
} from "../../lib/visual-editor/scene-document";
import {
  commitEditorHistory,
  type EditorHistory,
} from "../../lib/visual-editor/editor-history";
import type { TerrainBrushOperation } from "../../lib/visual-editor/terrain";
import type { EditorMode } from "./types";

export type TerrainEditorSnapshot = {
  bundle: PrototypeVisualProject;
  sceneSelection: { kind: "entity"; id: string } | null;
  assetSelection: string | null;
};

type TerrainAuthoringOptions = {
  editorMode: EditorMode;
  importBusy: boolean;
  setHistory: Dispatch<SetStateAction<EditorHistory<TerrainEditorSnapshot>>>;
  notify: (message: string) => void;
  markDirty: () => void;
  touchProject: (bundle: PrototypeVisualProject) => PrototypeVisualProject;
};

const TERRAIN_BRUSH_SUCCESS_MESSAGE: Record<
  TerrainBrushOperation["kind"],
  string
> = {
  raise: "地形を盛り上げました",
  lower: "地形を掘りました",
  flatten: "地形をならしました",
  smooth: "地形を滑らかにしました",
};

/** Keeps Terrain edits as one undoable, saved authoring transaction. */
export function useTerrainAuthoring({
  editorMode,
  importBusy,
  setHistory,
  notify,
  markDirty,
  touchProject,
}: TerrainAuthoringOptions) {
  const handleCreateTerrain = useCallback(() => {
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
      const created = addTerrainEntity(
        current.present.bundle.scene,
        current.present.bundle.assets,
        materialAssetId,
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

  return { handleCreateTerrain, handleTerrainBrush };
}
