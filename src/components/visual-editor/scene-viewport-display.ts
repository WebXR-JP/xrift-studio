export type SceneViewportDisplayMode =
  | "scene"
  | "unlit"
  | "wireframe"
  | "colliders";

export type SceneViewportMaterialStyle =
  | "scene"
  | "unlit"
  | "wireframe"
  | "ghost"
  | "collider-wireframe";

export const SCENE_VIEWPORT_DISPLAY_OPTIONS: readonly {
  value: SceneViewportDisplayMode;
  label: string;
  description: string;
}[] = [
  {
    value: "scene",
    label: "シーン",
    description: "Skybox、Fog、ライト、Materialを含む通常表示",
  },
  {
    value: "unlit",
    label: "ライトなし",
    description: "ライトと環境効果を外し、Materialの基本色を確認",
  },
  {
    value: "wireframe",
    label: "ワイヤー",
    description: "環境効果を外し、Meshのエッジを確認",
  },
  {
    value: "colliders",
    label: "コライダー",
    description: "Meshを抑え、BoxとMesh Colliderを確認",
  },
] as const;

export type SceneViewportDisplayProfile = {
  backgroundColor: string | null;
  showSkybox: boolean;
  showFog: boolean;
  showSceneLighting: boolean;
  showEditorLighting: boolean;
  showHelpers: boolean;
  showAllColliders: boolean;
};

const NEUTRAL_DEBUG_BACKGROUND = "#e7ebf0";

export function getSceneViewportDisplayProfile(
  mode: SceneViewportDisplayMode,
): SceneViewportDisplayProfile {
  switch (mode) {
    case "scene":
      return {
        backgroundColor: null,
        showSkybox: true,
        showFog: true,
        showSceneLighting: true,
        showEditorLighting: true,
        showHelpers: true,
        showAllColliders: false,
      };
    case "unlit":
      return {
        backgroundColor: NEUTRAL_DEBUG_BACKGROUND,
        showSkybox: false,
        showFog: false,
        showSceneLighting: false,
        showEditorLighting: false,
        showHelpers: true,
        showAllColliders: false,
      };
    case "wireframe":
      return {
        backgroundColor: NEUTRAL_DEBUG_BACKGROUND,
        showSkybox: false,
        showFog: false,
        showSceneLighting: false,
        showEditorLighting: false,
        showHelpers: false,
        showAllColliders: false,
      };
    case "colliders":
      return {
        backgroundColor: NEUTRAL_DEBUG_BACKGROUND,
        showSkybox: false,
        showFog: false,
        showSceneLighting: false,
        showEditorLighting: false,
        showHelpers: false,
        showAllColliders: true,
      };
  }
}

export function getEntityMeshMaterialStyle(
  mode: SceneViewportDisplayMode,
  hasBoxCollider: boolean,
  hasMeshCollider: boolean,
): SceneViewportMaterialStyle | null {
  switch (mode) {
    case "scene":
      return "scene";
    case "unlit":
      return "unlit";
    case "wireframe":
      return "wireframe";
    case "colliders":
      if (hasMeshCollider) return "collider-wireframe";
      if (hasBoxCollider) return "ghost";
      return null;
  }
}
