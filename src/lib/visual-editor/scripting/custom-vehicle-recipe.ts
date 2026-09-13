import type { SceneRecipe, SceneRecipeInstantiation } from "../scene-recipe-catalog";
import type { SceneDocument, Vec3 } from "../scene-document";
import { createScriptComponent } from "../scene-document";
import type { AssetManifest } from "../asset-manifest";
import { createEmptyEntity } from "../editor-session";
import { createDocumentId } from "../document-id";
import { tauri } from "../../tauri";
import { ensureWorldAssetModels } from "./world-asset-import";
import { createWorldAssetHierarchy } from "./world-asset-hierarchy";
import { createScriptAsset, createScriptRelativePath, addScriptAsset } from "./script-files";
import { createScriptTemplateSource } from "./script-templates";

export const CUSTOM_VEHICLE_RECIPE: SceneRecipe = {
  id: "scene-recipe.custom-vehicle", name: "カスタム車", assembly: "vehicle",
  description: "2人乗りのオープンカー。地面や坂に追従し、走行中はタイヤが回って後方から煙が出ます。",
  category: "effect", group: "乗り物", tags: ["Vehicle", "車", "座席", "運転"], projectKinds: ["world"],
  note: "Playで運転席をクリックして乗車。W/Sで前後、A/Dで旋回、Spaceで降車します。車体・座席・タイヤ・煙はHierarchyで編集できます。",
  parts: [],
};

export async function instantiateCustomVehicle(scene: SceneDocument, assets: AssetManifest, projectPath: string, position: Vec3): Promise<SceneRecipeInstantiation> {
  let nextAssets = await ensureWorldAssetModels(projectPath, assets, "vehicle");
  const path = createScriptRelativePath("Custom Vehicle", nextAssets, [], "tsx");
  const script = createScriptAsset(createDocumentId("script"), "カスタム車", path, null, "tsx");
  await tauri.writeTextFile(projectPath, path, createScriptTemplateSource("vehicle", "カスタム車")!);
  nextAssets = addScriptAsset(nextAssets, script);
  const created = createEmptyEntity(scene, null, "カスタム車")!;
  const root = created.scene.entities[created.entityId]!;
  const nextScene = { ...created.scene, entities: { ...created.scene.entities, [root.id]: { ...root, components: [
    ...root.components.map(component => component.type === "transform" ? { ...component, position } : component),
    createScriptComponent(createDocumentId("component-script"), script.id)!,
  ] } } };
  return { scene: createWorldAssetHierarchy(nextScene, nextAssets, root.id, "vehicle"), assets: nextAssets, rootEntityId: root.id,
    createdAssetIds: Object.keys(nextAssets.assets).filter(id => !assets.assets[id]),
  };
}
