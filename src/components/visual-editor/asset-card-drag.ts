import {
  isEnvironmentTextureAsset,
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
  MATERIALS_DRAG_MIME,
  SCENE_ASSET_DRAG_MIME,
  SKYBOX_DRAG_MIME,
  TEXTURE_DRAG_MIME,
} from "./types";
import { CHATGPT_MAX_MATERIAL_ATTACHMENTS } from "../../lib/visual-editor/chatgpt-attachments";

/** One canonical payload writer for AssetCard grid and list variants. */
export function writeAssetCardDragData(
  dataTransfer: DataTransfer,
  asset: SceneAsset,
  selectedMaterialIds: readonly string[] = [],
): void {
  const entries: Record<string, string> = {
    [ASSET_LIBRARY_ITEM_DRAG_MIME]: asset.id,
  };
  if (asset.kind === "material") {
    entries[MATERIAL_DRAG_MIME] = asset.id;
    if (selectedMaterialIds.includes(asset.id)) {
      const ids = [...new Set([asset.id, ...selectedMaterialIds])].slice(0, CHATGPT_MAX_MATERIAL_ATTACHMENTS);
      if (ids.length > 1) entries[MATERIALS_DRAG_MIME] = JSON.stringify(ids);
    }
  }
  if (asset.kind === "texture") entries[TEXTURE_DRAG_MIME] = asset.id;
  if (isEnvironmentTextureAsset(asset) || asset.kind === "skybox") {
    entries[SKYBOX_DRAG_MIME] = asset.id;
  }
  if (isScenePlaceableAsset(asset)) entries[SCENE_ASSET_DRAG_MIME] = asset.id;
  writeEditorDragData(dataTransfer, entries);
}

export function clearAssetCardDragData(): void {
  clearEditorDragData();
}
