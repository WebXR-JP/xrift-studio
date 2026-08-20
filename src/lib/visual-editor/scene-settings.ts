import { isRecord } from "../json-guards";

/**
 * Scene-wide authoring values. These are intentionally separate from Entity
 * components: a sky, fog or editor camera applies to the whole scene rather
 * than becoming an object that can be accidentally parented or duplicated.
 */
export type SceneSkyboxSettings = {
  /** Show the skybox as the visible scene background. */
  enabled: boolean;
  /** Use the skybox image for image-based lighting and reflections. */
  iblEnabled: boolean;
  /** Projection used to place the sky around the scene. */
  projection: "infinite" | "box" | "dome";
  /** Optional equirectangular texture Asset used instead of the gradient. */
  imageAssetId?: string;
  /**
   * Optional Custom Shader Material Asset drawn as the sky. It takes priority
   * over the image and the gradient, so a procedural sky (stars, aurora) stays
   * one Material the Inspector can retune rather than a second settings shape.
   */
  materialAssetId?: string;
  topColor: string;
  bottomColor: string;
  offset: number;
  exponent: number;
  /** Horizontal rotation of an equirectangular image, in degrees. */
  rotationDegrees: number;
  /** Flip the image vertically when the source orientation is upside down. */
  flipY: boolean;
  /** Background and IBL intensity for an image skybox. */
  exposure: number;
  /** Transform of the finite Box or Dome sky mesh, in scene units/degrees. */
  meshPosition: [number, number, number];
  meshRotationDegrees: [number, number, number];
  meshScale: [number, number, number];
  /** Capture/tripod center in normalized sky-mesh coordinates. */
  center: [number, number, number];
};

export type SceneFogSettings = {
  enabled: boolean;
  color: string;
  near: number;
  far: number;
};

export type SceneAmbientSettings = {
  /** Off means no flat fill at all, so an unlit surface stays black. */
  enabled: boolean;
  color: string;
  intensity: number;
};

export type SceneCameraSettings = {
  near: number;
  far: number;
  fov: number;
};

/** Scene-wide post effects shared by the editor and published output. */
export type ScenePostprocessingSettings = {
  enabled: boolean;
  /** Use a half-float compositor target and ACES tone mapping for HDR values. */
  hdr: {
    enabled: boolean;
    toneMapping: "aces" | "none";
  };
  bloom: {
    enabled: boolean;
    threshold: number;
    strength: number;
    radius: number;
  };
  /** Screen-space ambient occlusion, applied before bloom. */
  ao: {
    enabled: boolean;
    radius: number;
    minDistance: number;
    maxDistance: number;
  };
  /**
   * Colour grading, applied last.
   *
   * Exposure decides how much light reaches the frame; grading decides what it
   * looks like once it has. Warming a Scene by raising exposure blows out the
   * highlights instead, which is the usual reason a world ends up washed out
   * rather than warm.
   */
  grading: {
    enabled: boolean;
    /** 1 leaves contrast alone; above 1 deepens shadows around mid grey. */
    contrast: number;
    /** 1 leaves saturation alone; 0 is greyscale. */
    saturation: number;
    /** -1 cools toward blue, +1 warms toward orange. */
    temperature: number;
    /** -1 shifts toward green, +1 toward magenta. */
    tint: number;
  };
  exposure: number;
};

/**
 * Whether an emissive Material in this scene will actually bloom.
 *
 * Post effects are off in a new scene and Bloom sits behind that switch, so an
 * emissive Material can look flat for a reason that has nothing to do with the
 * Material. Callers use this to say so rather than leaving it to be discovered.
 */
export function sceneBloomIsActive(scene: {
  settings?: unknown;
}): boolean {
  const settings = resolveSceneSettings(
    (scene.settings ?? undefined) as Parameters<typeof resolveSceneSettings>[0],
  );
  return settings.postprocessing.enabled && settings.postprocessing.bloom.enabled;
}

/**
 * Global wind. Entities with a Wind component sway from it, and shader
 * materials that respond to wind — water, foliage — read the same values
 * through the wind contract, so a scene only ever has one wind.
 */
export type SceneVegetationSettings = {
  enabled: boolean;
  windStrength: number;
  windSpeed: number;
  gustStrength: number;
  /**
   * Compass direction the wind blows toward, in degrees. The transform-based
   * Wind component predates this and ignores it; it exists so shaders can
   * agree on a direction instead of each picking their own.
   */
  windDirectionDegrees: number;
};

/**
 * Player physics for the published world.
 *
 * These are the two knobs `xrift.json`'s `world.physics` carries, so they are
 * modelled with XRift's names and units rather than Studio's own: `gravity` is
 * a positive magnitude here, matching the template's `9.81` default, while the
 * editor's Play mode applies it as a downward vector.
 */
export type ScenePhysicsSettings = {
  /** Downward acceleration magnitude. XRift's template default is 9.81. */
  gravity: number;
  allowInfiniteJump: boolean;
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
  postprocessing: ScenePostprocessingSettings;
  vegetation: SceneVegetationSettings;
  physics: ScenePhysicsSettings;
  editor: {
    backgroundColor: string;
    gizmo: SceneGizmoSettings;
  };
};

export const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  skybox: {
    // Off for a new Scene. A gradient sky fills the frame with light-coloured
    // pixels before the author has lit anything, which reads as though the
    // Scene is lit when nothing in it is.
    enabled: false,
    iblEnabled: false,
    projection: "infinite",
    imageAssetId: undefined,
    materialAssetId: undefined,
    topColor: "#87ceeb",
    bottomColor: "#ffffff",
    offset: 0,
    exponent: 1,
    rotationDegrees: 0,
    flipY: false,
    exposure: 1,
    meshPosition: [0, 0, 0],
    meshRotationDegrees: [0, 0, 0],
    meshScale: [100, 100, 100],
    center: [0, 0.01, 0],
  },
  fog: {
    enabled: true,
    color: "#18181b",
    near: 120,
    far: 600,
  },
  ambient: {
    // Off for a new Scene. An ambient light multiplies albedo with no falloff
    // and no direction, so a scene-wide 0.55 white meant an unlit surface still
    // showed its base colour at better than half brightness — a floor with no
    // light in the Scene came out flat orange rather than black — and it filled
    // every shadow the author's key light cast, so placing or moving a light
    // barely changed the picture. The value below is what it uses once switched
    // on; fill that comes from somewhere belongs to the skybox through `ibl`.
    enabled: false,
    color: "#ffffff",
    intensity: 0.55,
  },
  camera: {
    near: 0.1,
    far: 2000,
    fov: 46,
  },
  postprocessing: {
    // Off by default. A new scene should start at the cheapest thing that
    // still looks right, and the compositor costs a full-screen pass plus an
    // SSAO pass before an author has asked for either. The individual effects
    // keep their tuned values, so switching this on is one toggle rather than
    // a setup task.
    enabled: false,
    hdr: {
      enabled: true,
      toneMapping: "aces",
    },
    bloom: {
      enabled: true,
      // Imported assets can carry emissive values far above one. A
      // conservative threshold prevents a single texture from washing out
      // the entire frame while still giving authored lights a readable halo.
      threshold: 8,
      strength: 0.12,
      radius: 0.18,
    },
    ao: {
      enabled: true,
      radius: 8,
      minDistance: 0.005,
      maxDistance: 0.1,
    },
    grading: {
      // Neutral by default: on, but changing nothing. An author who opens the
      // controls sees the identity values rather than a look someone chose.
      enabled: true,
      contrast: 1,
      saturation: 1,
      temperature: 0,
      tint: 0,
    },
    exposure: 0.85,
  },
  vegetation: {
    enabled: true,
    windStrength: 0.08,
    windSpeed: 0.8,
    gustStrength: 0.35,
    windDirectionDegrees: 45,
  },
  // Matches the values XRift's own world template ships with, so a Studio
  // world behaves like a hand-written one until the author changes them.
  physics: {
    gravity: 9.81,
    allowInfiniteJump: true,
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

function clampedOr(value: unknown, fallback: number): number {
  const resolved = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(resolved, -1), 1);
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function skyboxProjectionOr(
  value: unknown,
  fallback: SceneSkyboxSettings["projection"],
): SceneSkyboxSettings["projection"] {
  return value === "infinite" || value === "box" || value === "dome"
    ? value
    : fallback;
}

function vec3Or(
  value: unknown,
  fallback: [number, number, number],
  min?: number,
): [number, number, number] {
  if (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (entry) =>
        typeof entry === "number" &&
        Number.isFinite(entry) &&
        (min === undefined || entry >= min),
    )
  ) {
    return [value[0], value[1], value[2]];
  }
  return [...fallback];
}

/**
 * Reads old documents safely as well as newly-authored scenes. The returned
 * object is always complete, so UI and compiler callers do not need migration
 * branches for a previously saved project.
 */
export function resolveSceneSettings(value: unknown): SceneSettings {
  const settings = isRecord(value) ? value : {};
  const physics = isRecord(settings.physics) ? settings.physics : {};
  const skybox = isRecord(settings.skybox) ? settings.skybox : {};
  const fog = isRecord(settings.fog) ? settings.fog : {};
  const ambient = isRecord(settings.ambient) ? settings.ambient : {};
  const camera = isRecord(settings.camera) ? settings.camera : {};
  const postprocessing = isRecord(settings.postprocessing)
    ? settings.postprocessing
    : {};
  const hdr = isRecord(postprocessing.hdr) ? postprocessing.hdr : {};
  const bloom = isRecord(postprocessing.bloom) ? postprocessing.bloom : {};
  const ao = isRecord(postprocessing.ao) ? postprocessing.ao : {};
  const grading = isRecord(postprocessing.grading)
    ? postprocessing.grading
    : {};
  const vegetation = isRecord(settings.vegetation) ? settings.vegetation : {};
  const editor = isRecord(settings.editor) ? settings.editor : {};
  const gizmo = isRecord(editor.gizmo) ? editor.gizmo : {};
  const resolvedSkyboxImageAssetId =
    typeof skybox.imageAssetId === "string" && skybox.imageAssetId.trim()
      ? skybox.imageAssetId
      : undefined;
  const resolvedSkyboxMaterialAssetId =
    typeof skybox.materialAssetId === "string" && skybox.materialAssetId.trim()
      ? skybox.materialAssetId
      : undefined;
  const resolvedSkyboxEnabled = booleanOr(
    skybox.enabled,
    DEFAULT_SCENE_SETTINGS.skybox.enabled,
  );

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
      enabled: resolvedSkyboxEnabled,
      // Image skyboxes authored before this option existed drove both the
      // background and environment. Preserve that behavior while new gradient
      // scenes keep IBL off until an image is assigned.
      iblEnabled: booleanOr(
        skybox.iblEnabled,
        resolvedSkyboxImageAssetId
          ? resolvedSkyboxEnabled
          : DEFAULT_SCENE_SETTINGS.skybox.iblEnabled,
      ),
      projection: skyboxProjectionOr(
        skybox.projection,
        DEFAULT_SCENE_SETTINGS.skybox.projection,
      ),
      imageAssetId: resolvedSkyboxImageAssetId,
      materialAssetId: resolvedSkyboxMaterialAssetId,
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
      meshPosition: vec3Or(
        skybox.meshPosition,
        DEFAULT_SCENE_SETTINGS.skybox.meshPosition,
      ),
      meshRotationDegrees: vec3Or(
        skybox.meshRotationDegrees,
        DEFAULT_SCENE_SETTINGS.skybox.meshRotationDegrees,
      ),
      meshScale: vec3Or(
        skybox.meshScale,
        DEFAULT_SCENE_SETTINGS.skybox.meshScale,
        0.001,
      ),
      center: vec3Or(
        skybox.center,
        DEFAULT_SCENE_SETTINGS.skybox.center,
      ),
    },
    fog: {
      enabled: booleanOr(fog.enabled, DEFAULT_SCENE_SETTINGS.fog.enabled),
      color: colorOr(fog.color, DEFAULT_SCENE_SETTINGS.fog.color),
      near: Math.min(normalizedFogNear, resolvedFogFar - 0.001),
      far: resolvedFogFar,
    },
    ambient: {
      // A Scene saved before the switch existed had its ambient on, so the
      // absent field reads as true rather than as the new-Scene default.
      enabled: booleanOr(ambient.enabled, true),
      color: colorOr(ambient.color, DEFAULT_SCENE_SETTINGS.ambient.color),
      intensity: finiteOr(ambient.intensity, DEFAULT_SCENE_SETTINGS.ambient.intensity, 0),
    },
    camera: {
      near: Math.min(normalizedCameraNear, resolvedCameraFar - 0.0001),
      far: resolvedCameraFar,
      fov: finiteOr(camera.fov, DEFAULT_SCENE_SETTINGS.camera.fov, 1),
    },
    postprocessing: {
      enabled: booleanOr(
        postprocessing.enabled,
        DEFAULT_SCENE_SETTINGS.postprocessing.enabled,
      ),
      hdr: {
        enabled: booleanOr(
          hdr.enabled,
          DEFAULT_SCENE_SETTINGS.postprocessing.hdr.enabled,
        ),
        toneMapping:
          hdr.toneMapping === "none" || hdr.toneMapping === "aces"
            ? hdr.toneMapping
            : DEFAULT_SCENE_SETTINGS.postprocessing.hdr.toneMapping,
      },
      bloom: {
        enabled: booleanOr(
          bloom.enabled,
          DEFAULT_SCENE_SETTINGS.postprocessing.bloom.enabled,
        ),
        threshold: finiteOr(
          bloom.threshold,
          DEFAULT_SCENE_SETTINGS.postprocessing.bloom.threshold,
          0,
        ),
        strength: finiteOr(
          bloom.strength,
          DEFAULT_SCENE_SETTINGS.postprocessing.bloom.strength,
          0,
        ),
        radius: finiteOr(
          bloom.radius,
          DEFAULT_SCENE_SETTINGS.postprocessing.bloom.radius,
          0,
        ),
      },
      ao: {
        enabled: booleanOr(
          ao.enabled,
          DEFAULT_SCENE_SETTINGS.postprocessing.ao.enabled,
        ),
        radius: finiteOr(
          ao.radius,
          DEFAULT_SCENE_SETTINGS.postprocessing.ao.radius,
          0.1,
        ),
        minDistance: finiteOr(
          ao.minDistance,
          DEFAULT_SCENE_SETTINGS.postprocessing.ao.minDistance,
          0,
        ),
        maxDistance: Math.max(
          finiteOr(
            ao.maxDistance,
            DEFAULT_SCENE_SETTINGS.postprocessing.ao.maxDistance,
            0.001,
          ),
          finiteOr(
            ao.minDistance,
            DEFAULT_SCENE_SETTINGS.postprocessing.ao.minDistance,
            0,
          ) + 0.001,
        ),
      },
      grading: {
        enabled: booleanOr(
          grading.enabled,
          DEFAULT_SCENE_SETTINGS.postprocessing.grading.enabled,
        ),
        contrast: finiteOr(
          grading.contrast,
          DEFAULT_SCENE_SETTINGS.postprocessing.grading.contrast,
          0,
        ),
        saturation: finiteOr(
          grading.saturation,
          DEFAULT_SCENE_SETTINGS.postprocessing.grading.saturation,
          0,
        ),
        temperature: clampedOr(
          grading.temperature,
          DEFAULT_SCENE_SETTINGS.postprocessing.grading.temperature,
        ),
        tint: clampedOr(
          grading.tint,
          DEFAULT_SCENE_SETTINGS.postprocessing.grading.tint,
        ),
      },
      exposure: finiteOr(
        postprocessing.exposure,
        DEFAULT_SCENE_SETTINGS.postprocessing.exposure,
        0,
      ),
    },
    vegetation: {
      enabled: booleanOr(
        vegetation.enabled,
        DEFAULT_SCENE_SETTINGS.vegetation.enabled,
      ),
      windStrength: finiteOr(
        vegetation.windStrength,
        DEFAULT_SCENE_SETTINGS.vegetation.windStrength,
        0,
      ),
      windSpeed: finiteOr(
        vegetation.windSpeed,
        DEFAULT_SCENE_SETTINGS.vegetation.windSpeed,
        0,
      ),
      gustStrength: finiteOr(
        vegetation.gustStrength,
        DEFAULT_SCENE_SETTINGS.vegetation.gustStrength,
        0,
      ),
      windDirectionDegrees: finiteOr(
        vegetation.windDirectionDegrees,
        DEFAULT_SCENE_SETTINGS.vegetation.windDirectionDegrees,
      ),
    },
    physics: {
      // Clamped at 0 rather than a positive minimum: zero gravity is a valid
      // world, and a negative value here would invert the sign XRift expects.
      gravity: finiteOr(
        physics.gravity,
        DEFAULT_SCENE_SETTINGS.physics.gravity,
        0,
      ),
      allowInfiniteJump: booleanOr(
        physics.allowInfiniteJump,
        DEFAULT_SCENE_SETTINGS.physics.allowInfiniteJump,
      ),
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
