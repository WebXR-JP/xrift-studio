/**
 * Scene-wide authoring values. These are intentionally separate from Entity
 * components: a sky, fog or editor camera applies to the whole scene rather
 * than becoming an object that can be accidentally parented or duplicated.
 */
export type SceneSkyboxSettings = {
  enabled: boolean;
  /** Optional equirectangular texture Asset used instead of the gradient. */
  imageAssetId?: string;
  topColor: string;
  bottomColor: string;
  offset: number;
  exponent: number;
  /** Horizontal rotation of an equirectangular image, in degrees. */
  rotationDegrees: number;
  /** Flip the image vertically when the source orientation is upside down. */
  flipY: boolean;
  /** Background and environment intensity for an image skybox. */
  exposure: number;
};

export type SceneFogSettings = {
  enabled: boolean;
  color: string;
  near: number;
  far: number;
};

export type SceneAmbientSettings = {
  color: string;
  intensity: number;
};

export type SceneCameraSettings = {
  near: number;
  far: number;
  fov: number;
};

export type SceneGizmoSettings = {
  size: number;
  gridVisible: boolean;
  gridSize: number;
  gridDivisions: number;
  snapEnabled: boolean;
  translateSnap: number;
  rotateSnapDegrees: number;
  scaleSnap: number;
};

export type SceneSettings = {
  skybox: SceneSkyboxSettings;
  fog: SceneFogSettings;
  ambient: SceneAmbientSettings;
  camera: SceneCameraSettings;
  editor: {
    backgroundColor: string;
    gizmo: SceneGizmoSettings;
  };
};

export const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  skybox: {
    enabled: true,
    imageAssetId: undefined,
    topColor: "#87ceeb",
    bottomColor: "#ffffff",
    offset: 0,
    exponent: 1,
    rotationDegrees: 0,
    flipY: false,
    exposure: 1,
  },
  fog: {
    enabled: true,
    color: "#18181b",
    near: 28,
    far: 80,
  },
  ambient: {
    color: "#ffffff",
    intensity: 0.55,
  },
  camera: {
    near: 0.1,
    far: 250,
    fov: 46,
  },
  editor: {
    backgroundColor: "#18181b",
    gizmo: {
      size: 0.82,
      gridVisible: true,
      gridSize: 40,
      gridDivisions: 40,
      snapEnabled: false,
      translateSnap: 0.5,
      rotateSnapDegrees: 15,
      scaleSnap: 0.1,
    },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function colorOr(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : fallback;
}

function finiteOr(value: unknown, fallback: number, min?: number): number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    (min === undefined || value >= min)
    ? value
    : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Reads old documents safely as well as newly-authored scenes. The returned
 * object is always complete, so UI and compiler callers do not need migration
 * branches for a previously saved project.
 */
export function resolveSceneSettings(value: unknown): SceneSettings {
  const settings = isRecord(value) ? value : {};
  const skybox = isRecord(settings.skybox) ? settings.skybox : {};
  const fog = isRecord(settings.fog) ? settings.fog : {};
  const ambient = isRecord(settings.ambient) ? settings.ambient : {};
  const camera = isRecord(settings.camera) ? settings.camera : {};
  const editor = isRecord(settings.editor) ? settings.editor : {};
  const gizmo = isRecord(editor.gizmo) ? editor.gizmo : {};

  const normalizedFogNear = finiteOr(fog.near, DEFAULT_SCENE_SETTINGS.fog.near, 0);
  const normalizedFogFar = finiteOr(fog.far, DEFAULT_SCENE_SETTINGS.fog.far, 0);
  const normalizedCameraNear = finiteOr(
    camera.near,
    DEFAULT_SCENE_SETTINGS.camera.near,
    0.0001,
  );
  const normalizedCameraFar = finiteOr(
    camera.far,
    DEFAULT_SCENE_SETTINGS.camera.far,
    0.0001,
  );
  const resolvedFogFar = Math.max(normalizedFogFar, normalizedFogNear + 0.001);
  const resolvedCameraFar = Math.max(
    normalizedCameraFar,
    normalizedCameraNear + 0.0001,
  );

  return {
    skybox: {
      enabled: booleanOr(skybox.enabled, DEFAULT_SCENE_SETTINGS.skybox.enabled),
      imageAssetId:
        typeof skybox.imageAssetId === "string" && skybox.imageAssetId.trim()
          ? skybox.imageAssetId
          : undefined,
      topColor: colorOr(skybox.topColor, DEFAULT_SCENE_SETTINGS.skybox.topColor),
      bottomColor: colorOr(
        skybox.bottomColor,
        DEFAULT_SCENE_SETTINGS.skybox.bottomColor,
      ),
      offset: finiteOr(skybox.offset, DEFAULT_SCENE_SETTINGS.skybox.offset),
      exponent: finiteOr(
        skybox.exponent,
        DEFAULT_SCENE_SETTINGS.skybox.exponent,
        0.01,
      ),
      rotationDegrees: finiteOr(
        skybox.rotationDegrees,
        DEFAULT_SCENE_SETTINGS.skybox.rotationDegrees,
      ),
      flipY: booleanOr(skybox.flipY, DEFAULT_SCENE_SETTINGS.skybox.flipY),
      exposure: finiteOr(
        skybox.exposure,
        DEFAULT_SCENE_SETTINGS.skybox.exposure,
        0,
      ),
    },
    fog: {
      enabled: booleanOr(fog.enabled, DEFAULT_SCENE_SETTINGS.fog.enabled),
      color: colorOr(fog.color, DEFAULT_SCENE_SETTINGS.fog.color),
      near: Math.min(normalizedFogNear, resolvedFogFar - 0.001),
      far: resolvedFogFar,
    },
    ambient: {
      color: colorOr(ambient.color, DEFAULT_SCENE_SETTINGS.ambient.color),
      intensity: finiteOr(ambient.intensity, DEFAULT_SCENE_SETTINGS.ambient.intensity, 0),
    },
    camera: {
      near: Math.min(normalizedCameraNear, resolvedCameraFar - 0.0001),
      far: resolvedCameraFar,
      fov: finiteOr(camera.fov, DEFAULT_SCENE_SETTINGS.camera.fov, 1),
    },
    editor: {
      backgroundColor: colorOr(
        editor.backgroundColor,
        DEFAULT_SCENE_SETTINGS.editor.backgroundColor,
      ),
      gizmo: {
        size: finiteOr(gizmo.size, DEFAULT_SCENE_SETTINGS.editor.gizmo.size, 0.1),
        gridVisible: booleanOr(
          gizmo.gridVisible,
          DEFAULT_SCENE_SETTINGS.editor.gizmo.gridVisible,
        ),
        gridSize: finiteOr(
          gizmo.gridSize,
          DEFAULT_SCENE_SETTINGS.editor.gizmo.gridSize,
          1,
        ),
        gridDivisions: Math.round(
          finiteOr(
            gizmo.gridDivisions,
            DEFAULT_SCENE_SETTINGS.editor.gizmo.gridDivisions,
            1,
          ),
        ),
        snapEnabled: booleanOr(
          gizmo.snapEnabled,
          DEFAULT_SCENE_SETTINGS.editor.gizmo.snapEnabled,
        ),
        translateSnap: finiteOr(
          gizmo.translateSnap,
          DEFAULT_SCENE_SETTINGS.editor.gizmo.translateSnap,
          0.001,
        ),
        rotateSnapDegrees: finiteOr(
          gizmo.rotateSnapDegrees,
          DEFAULT_SCENE_SETTINGS.editor.gizmo.rotateSnapDegrees,
          0.1,
        ),
        scaleSnap: finiteOr(
          gizmo.scaleSnap,
          DEFAULT_SCENE_SETTINGS.editor.gizmo.scaleSnap,
          0.001,
        ),
      },
    },
  };
}
