import {
  isScenePlaceableAsset,
  type SceneAsset,
} from "../../lib/visual-editor";
import {
  clearEditorDragData,
  writeEditorDragData,
} from "./editor-drag-data";
import {
  ASSET_LIBRARY_ITEM_DRAG_MIME,
  MATERIAL_DRAG_MIME,
  SCENE_ASSET_DRAG_MIME,
  TEXTURE_DRAG_MIME,
} from "./types";

/** One canonical payload writer for AssetCard grid and list variants. */
export function writeAssetCardDragData(
  dataTransfer: DataTransfer,
  asset: SceneAsset,
): void {
  const entries: Record<string, string> = {
    [ASSET_LIBRARY_ITEM_DRAG_MIME]: asset.id,
  };
  if (asset.kind === "material") entries[MATERIAL_DRAG_MIME] = asset.id;
  if (asset.kind === "texture") entries[TEXTURE_DRAG_MIME] = asset.id;
  if (isScenePlaceableAsset(asset)) entries[SCENE_ASSET_DRAG_MIME] = asset.id;
  writeEditorDragData(dataTransfer, entries);
}

export function clearAssetCardDragData(): void {
  clearEditorDragData();
}
