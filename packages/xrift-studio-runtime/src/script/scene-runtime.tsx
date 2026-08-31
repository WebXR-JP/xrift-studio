/**
 * Scene-wide state a behavior graph can change, and the named events it sends.
 *
 * The screen fade, the compositor, fog, ambient light, the sky and the camera
 * belong to no Entity, so they cannot go through the per-Entity bridges the
 * other targets use. They are held here, on one bridge attached to the Scene
 * root, and applied by a component both Studio Play and a published world
 * mount.
 *
 * They are owner-ordered overrides rather than commands on purpose: a fade is a
 * state, so releasing the trigger that set it puts the authored look back —
 * which is what Play Stop has to do.
 *
 * Everything here is client-local. A graph runs inside each viewer's own
 * runtime, so a「画質を上げる」button changes the picture for whoever pressed it
 * and leaves every other viewer alone. Nothing is synchronised and nothing is
 * saved: the authored Scene settings are what a fresh viewer sees.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AmbientLight,
  type Camera,
  Color,
  EquirectangularReflectionMapping,
  type Euler,
  Fog,
  LinearSRGBColorSpace,
  type Light,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from "three";
// Statically imported, not fetched on demand: a published world is built with
// no dynamic import, so a graph that swaps to an HDR sky has to find its
// decoder already there.
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";

export const XRIFT_SCENE_RUNTIME_USER_DATA_KEY = "xriftSceneRuntime" as const;

/**
 * Marks an object that draws the authored sky.
 *
 * A gradient sky, a Box or Dome sky and a Sky Shader are all meshes, so
 *「背景のSkyboxを消す」cannot be done by clearing `scene.background` alone. The
 * three surfaces that build a sky set this flag, and this module is the only
 * thing that reads it — which is why the flag lives here rather than in each
 * of them.
 */
export const XRIFT_SCENE_SKYBOX_USER_DATA_KEY = "xriftSceneSkybox" as const;

/**
 * The authored compositor values, published for whoever needs to read them.
 *
 * `xrift/toggleProperty` has to know what「今ON/OFFどちらか」is before it can
 * flip it, and for bloom or AO the answer lives in the Scene settings the
 * compositor was handed — not in the scene graph, where fog and the sky can be
 * read straight off the objects. Publishing it beside the bridge is what lets
 * a toggle work on the first press instead of guessing the world was already
 * bright.
 */
export const XRIFT_SCENE_POSTPROCESSING_BASELINE_USER_DATA_KEY =
  "xriftScenePostprocessingBaseline" as const;

export type XriftScenePostprocessingBaseline = {
  readonly enabled: boolean;
  readonly bloom: boolean;
  readonly bloomStrength: number;
  readonly bloomRadius: number;
  readonly bloomThreshold: number;
  readonly ao: boolean;
  readonly grading: boolean;
};

export function publishXriftScenePostprocessingBaseline(
  root: Object3D,
  baseline: XriftScenePostprocessingBaseline,
): () => void {
  const holder = root.userData as Record<string, unknown>;
  holder[XRIFT_SCENE_POSTPROCESSING_BASELINE_USER_DATA_KEY] = baseline;
  return () => {
    delete holder[XRIFT_SCENE_POSTPROCESSING_BASELINE_USER_DATA_KEY];
  };
}

export function readXriftScenePostprocessingBaseline(
  root: Object3D,
): XriftScenePostprocessingBaseline | null {
  const candidate = (root.userData as Record<string, unknown>)[
    XRIFT_SCENE_POSTPROCESSING_BASELINE_USER_DATA_KEY
  ];
  return typeof candidate === "object" && candidate !== null
    ? (candidate as XriftScenePostprocessingBaseline)
    : null;
}

/** An Asset a graph can point the sky at, resolved to something loadable. */
export type XriftSceneRuntimeAsset = {
  /** URL the texture is fetched from. A data URL in Play, a file in a world. */
  url: string;
  /** Decoder the image needs. Anything else is read as an ordinary image. */
  sourceFormat?: "hdr" | "exr" | string;
  /** Final flip, already combined with the Asset's own import setting. */
  flipY?: boolean;
  name?: string;
};

export type XriftSceneRuntimeOverrides = {
  /** Absolute tone-mapping exposure. Undefined leaves the authored value. */
  exposure?: number;
  /** 0 shows the world, 1 covers it completely. */
  fade?: number;
  /** Linear-light RGB of the covering colour. */
  fadeColor?: readonly [number, number, number];
  /** Compositor master switch, and the passes behind it. */
  postprocessing?: boolean;
  bloom?: boolean;
  bloomStrength?: number;
  bloomRadius?: number;
  bloomThreshold?: number;
  ao?: boolean;
  grading?: boolean;
  fog?: boolean;
  fogColor?: readonly [number, number, number];
  fogNear?: number;
  fogFar?: number;
  ambient?: boolean;
  ambientColor?: readonly [number, number, number];
  ambientIntensity?: number;
  skybox?: boolean;
  skyboxIbl?: boolean;
  skyboxExposure?: number;
  /** Degrees, matching the Scene setting rather than the radians three uses. */
  skyboxRotation?: number;
  /** Asset id of an equirectangular image, or `null` for the authored one. */
  skyboxImage?: string | null;
  cameraFov?: number;
};

/**
 * The resolved override set.
 *
 * `null` means「この端末では上書きしていない」, so every consumer restores the
 * authored value instead of guessing one. That distinction is the whole reason
 * the state is not simply the Scene settings with different numbers in it.
 */
export type XriftSceneRuntimeState = {
  readonly revision: number;
  readonly exposure: number | null;
  readonly fade: number;
  readonly fadeColor: readonly [number, number, number];
  readonly postprocessing: boolean | null;
  readonly bloom: boolean | null;
  readonly bloomStrength: number | null;
  readonly bloomRadius: number | null;
  readonly bloomThreshold: number | null;
  readonly ao: boolean | null;
  readonly grading: boolean | null;
  readonly fog: boolean | null;
  readonly fogColor: readonly [number, number, number] | null;
  readonly fogNear: number | null;
  readonly fogFar: number | null;
  readonly ambient: boolean | null;
  readonly ambientColor: readonly [number, number, number] | null;
  readonly ambientIntensity: number | null;
  readonly skybox: boolean | null;
  readonly skyboxIbl: boolean | null;
  readonly skyboxExposure: number | null;
  readonly skyboxRotation: number | null;
  readonly skyboxImage: string | null;
  readonly cameraFov: number | null;
};

export type XriftSceneRuntimeBridge = {
  setOwner(
    owner: object,
    order: number,
    key: string,
    overrides: XriftSceneRuntimeOverrides,
  ): void;
  removeOwner(owner: object): void;
  read(): Readonly<XriftSceneRuntimeState>;
};

const IDLE_STATE: XriftSceneRuntimeState = {
  revision: 0,
  exposure: null,
  fade: 0,
  fadeColor: [1, 1, 1],
  postprocessing: null,
  bloom: null,
  bloomStrength: null,
  bloomRadius: null,
  bloomThreshold: null,
  ao: null,
  grading: null,
  fog: null,
  fogColor: null,
  fogNear: null,
  fogFar: null,
  ambient: null,
  ambientColor: null,
  ambientIntensity: null,
  skybox: null,
  skyboxIbl: null,
  skyboxExposure: null,
  skyboxRotation: null,
  skyboxImage: null,
  cameraFov: null,
};

const clamp = (value: number, lower: number, upper: number): number =>
  Math.min(upper, Math.max(lower, value));

export function createXriftSceneRuntimeBridge(): XriftSceneRuntimeBridge {
  const owners = new Map<
    object,
    { order: number; key: string; overrides: XriftSceneRuntimeOverrides }
  >();
  let state = IDLE_STATE;

  const resolve = (): void => {
    const next: {
      -readonly [K in keyof XriftSceneRuntimeState]: XriftSceneRuntimeState[K];
    } = { ...IDLE_STATE, revision: state.revision + 1 };
    const ordered = [...owners.values()].sort(
      (left, right) =>
        left.order - right.order || left.key.localeCompare(right.key),
    );
    for (const owner of ordered) {
      const overrides = owner.overrides;
      if (overrides.exposure !== undefined) {
        next.exposure = clamp(overrides.exposure, 0, 16);
      }
      if (overrides.fade !== undefined) next.fade = clamp(overrides.fade, 0, 1);
      if (overrides.fadeColor !== undefined) next.fadeColor = overrides.fadeColor;
      if (overrides.postprocessing !== undefined) {
        next.postprocessing = overrides.postprocessing;
      }
      if (overrides.bloom !== undefined) next.bloom = overrides.bloom;
      if (overrides.bloomStrength !== undefined) {
        next.bloomStrength = clamp(overrides.bloomStrength, 0, 5);
      }
      if (overrides.bloomRadius !== undefined) {
        next.bloomRadius = clamp(overrides.bloomRadius, 0, 1);
      }
      if (overrides.bloomThreshold !== undefined) {
        next.bloomThreshold = clamp(overrides.bloomThreshold, 0, 1);
      }
      if (overrides.ao !== undefined) next.ao = overrides.ao;
      if (overrides.grading !== undefined) next.grading = overrides.grading;
      if (overrides.fog !== undefined) next.fog = overrides.fog;
      if (overrides.fogColor !== undefined) next.fogColor = overrides.fogColor;
      if (overrides.fogNear !== undefined) {
        next.fogNear = Math.max(0, overrides.fogNear);
      }
      if (overrides.fogFar !== undefined) {
        next.fogFar = Math.max(0, overrides.fogFar);
      }
      if (overrides.ambient !== undefined) next.ambient = overrides.ambient;
      if (overrides.ambientColor !== undefined) {
        next.ambientColor = overrides.ambientColor;
      }
      if (overrides.ambientIntensity !== undefined) {
        next.ambientIntensity = clamp(overrides.ambientIntensity, 0, 10);
      }
      if (overrides.skybox !== undefined) next.skybox = overrides.skybox;
      if (overrides.skyboxIbl !== undefined) next.skyboxIbl = overrides.skyboxIbl;
      if (overrides.skyboxExposure !== undefined) {
        next.skyboxExposure = clamp(overrides.skyboxExposure, 0, 8);
      }
      if (overrides.skyboxRotation !== undefined) {
        next.skyboxRotation = overrides.skyboxRotation;
      }
      if (overrides.skyboxImage !== undefined) {
        next.skyboxImage = overrides.skyboxImage;
      }
      if (overrides.cameraFov !== undefined) {
        next.cameraFov = clamp(overrides.cameraFov, 1, 179);
      }
    }
    state = next;
  };

  return {
    setOwner(owner, order, key, overrides) {
      owners.set(owner, {
        order,
        key,
        overrides: { ...owners.get(owner)?.overrides, ...overrides },
      });
      resolve();
    },
    removeOwner(owner) {
      if (!owners.delete(owner)) return;
      resolve();
    },
    read() {
      return state;
    },
  };
}

export function isXriftSceneRuntimeBridge(
  value: unknown,
): value is XriftSceneRuntimeBridge {
  const candidate = value as XriftSceneRuntimeBridge | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.setOwner === "function" &&
    typeof candidate.removeOwner === "function" &&
    typeof candidate.read === "function"
  );
}

export function findXriftSceneRuntimeBridge(
  root: Object3D,
): XriftSceneRuntimeBridge | null {
  const candidate = (root.userData as Record<string, unknown>)[
    XRIFT_SCENE_RUNTIME_USER_DATA_KEY
  ];
  return isXriftSceneRuntimeBridge(candidate) ? candidate : null;
}

/**
 * A named event leaving a graph.
 *
 * A module-level bus for the same reason interactions use one: the sender and
 * whatever reacts to it are rendered far apart, and threading a callback
 * through the whole tree would make the two surfaces wire it differently.
 */
type XriftSceneEventHandler = (
  payload: ReadonlyMap<string, readonly (number | boolean)[]>,
) => void;

const sceneEventHandlers = new Map<string, Set<XriftSceneEventHandler>>();

export function subscribeXriftSceneEvent(
  name: string,
  handler: XriftSceneEventHandler,
): () => void {
  const existing = sceneEventHandlers.get(name) ?? new Set();
  existing.add(handler);
  sceneEventHandlers.set(name, existing);
  return () => {
    const current = sceneEventHandlers.get(name);
    if (!current) return;
    current.delete(handler);
    if (current.size === 0) sceneEventHandlers.delete(name);
  };
}

export function emitXriftSceneEvent(
  name: string,
  payload: ReadonlyMap<string, readonly (number | boolean)[]>,
): void {
  const handlers = sceneEventHandlers.get(name);
  if (!handlers) return;
  for (const handler of [...handlers]) handler(payload);
}

/**
 * What the authored Scene looked like before a graph touched it.
 *
 * Overrides are released one field at a time, so the restore is per field
 * rather than one snapshot of everything: an absent key means「まだ触っていない」
 * and anything else is the authored value waiting to be put back. Capturing
 * lazily, at the first write, is also what keeps this correct in a world whose
 * sky finishes loading after the first frame.
 */
type AuthoredScene = {
  fog?: Scene["fog"];
  background?: Scene["background"];
  backgroundIntensity?: number;
  backgroundRotation?: Euler;
  environment?: Scene["environment"];
  environmentIntensity?: number;
  environmentRotation?: Euler;
  cameraFov?: number;
  ambient?: Map<Light, { visible: boolean; intensity: number; color: Color }>;
  /**
   * An ambient light this module added because the Scene had none.
   *
   * A Scene with 環境光 switched off renders no ambient light at all, so a
   * graph offering「明るくする」would have nothing to turn on. Owning one keeps
   * the promise the property makes, and it is removed again with everything
   * else on Stop.
   */
  ownedAmbient?: AmbientLight;
  skyVisible?: Map<Object3D, boolean>;
};

type SkyboxTextureState = {
  /** Asset the texture belongs to, so a slow load cannot land after a change. */
  assetId: string;
  texture: Texture | null;
};

const isAmbientLight = (object: Object3D): object is Light =>
  (object as Light & { isAmbientLight?: boolean }).isAmbientLight === true;

const isAuthoredSky = (object: Object3D): boolean =>
  (object.userData as Record<string, unknown>)[
    XRIFT_SCENE_SKYBOX_USER_DATA_KEY
  ] === true;

const linearColor = (rgb: readonly [number, number, number]): Color =>
  new Color().setRGB(rgb[0], rgb[1], rgb[2], LinearSRGBColorSpace);

async function loadEquirectangularTexture(
  asset: XriftSceneRuntimeAsset,
): Promise<Texture> {
  const format = asset.sourceFormat;
  let texture: Texture;
  if (format === "hdr" || format === "exr") {
    const Loader = format === "hdr" ? HDRLoader : EXRLoader;
    texture = await new Loader().loadAsync(asset.url);
  } else {
    texture = await new TextureLoader().loadAsync(asset.url);
    texture.colorSpace = SRGBColorSpace;
  }
  texture.name = asset.name ? `${asset.name} (skybox)` : "xrift-scene-skybox";
  texture.flipY = asset.flipY ?? false;
  texture.mapping = EquirectangularReflectionMapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Starts or drops the sky image a graph asked for.
 *
 * An Asset the surface did not hand over is left alone rather than replaced
 * with a stand-in sky: an image nobody published cannot be drawn, and drawing
 * something else in its place would hide that from the author.
 */
function syncSkyboxImage(
  state: XriftSceneRuntimeState,
  assets: Readonly<Record<string, XriftSceneRuntimeAsset>> | undefined,
  current: { current: SkyboxTextureState | null },
  onLoaded: () => void,
): void {
  const wanted = state.skyboxImage;
  if ((current.current?.assetId ?? null) === wanted) return;
  current.current?.texture?.dispose();
  if (!wanted) {
    current.current = null;
    return;
  }
  const entry: SkyboxTextureState = { assetId: wanted, texture: null };
  current.current = entry;
  const asset = assets?.[wanted];
  if (!asset) return;
  void loadEquirectangularTexture(asset)
    .then((texture) => {
      if (current.current !== entry) {
        texture.dispose();
        return;
      }
      entry.texture = texture;
      onLoaded();
    })
    .catch(() => {
      // A failed decode leaves the authored sky in place, which is the same
      // thing the Scene shows when the Asset is missing.
    });
}

function applyFog(
  scene: Scene,
  state: XriftSceneRuntimeState,
  authored: AuthoredScene,
): void {
  const touched =
    state.fog !== null ||
    state.fogColor !== null ||
    state.fogNear !== null ||
    state.fogFar !== null;
  if (!touched) {
    if ("fog" in authored) {
      scene.fog = authored.fog ?? null;
      delete authored.fog;
    }
    return;
  }
  if (!("fog" in authored)) authored.fog = scene.fog;
  const base = authored.fog;
  const baseFog = base instanceof Fog ? base : null;
  if (state.fog === false || (state.fog === null && !base)) {
    scene.fog = null;
    return;
  }
  const near = state.fogNear ?? baseFog?.near ?? 10;
  const far = Math.max(state.fogFar ?? baseFog?.far ?? 100, near + 0.001);
  const color = state.fogColor
    ? linearColor(state.fogColor)
    : (baseFog?.color.clone() ?? new Color(0xffffff));
  const live = scene.fog;
  if (live instanceof Fog && live !== base) {
    live.color.copy(color);
    live.near = near;
    live.far = far;
    return;
  }
  scene.fog = new Fog(color, near, far);
}

function applyAmbient(
  scene: Scene,
  state: XriftSceneRuntimeState,
  authored: AuthoredScene,
): void {
  const touched =
    state.ambient !== null ||
    state.ambientColor !== null ||
    state.ambientIntensity !== null;
  if (!touched) {
    if (authored.ambient) {
      for (const [light, original] of authored.ambient) {
        light.visible = original.visible;
        light.intensity = original.intensity;
        light.color.copy(original.color);
      }
      delete authored.ambient;
    }
    if (authored.ownedAmbient) {
      authored.ownedAmbient.removeFromParent();
      authored.ownedAmbient.dispose();
      delete authored.ownedAmbient;
    }
    return;
  }
  const captured = authored.ambient ?? new Map();
  authored.ambient = captured;
  let found = false;
  scene.traverse((object) => {
    if (!isAmbientLight(object) || object === authored.ownedAmbient) return;
    found = true;
    if (!captured.has(object)) {
      captured.set(object, {
        visible: object.visible,
        intensity: object.intensity,
        color: object.color.clone(),
      });
    }
    const original = captured.get(object)!;
    object.visible = state.ambient ?? original.visible;
    object.intensity = state.ambientIntensity ?? original.intensity;
    object.color.copy(
      state.ambientColor ? linearColor(state.ambientColor) : original.color,
    );
  });
  if (found) {
    if (authored.ownedAmbient) {
      authored.ownedAmbient.removeFromParent();
      authored.ownedAmbient.dispose();
      delete authored.ownedAmbient;
    }
    return;
  }
  // Nothing to turn on: the Scene has 環境光 off, which is exactly when a
  // 「明るくする」button is worth having.
  if (state.ambient === false) {
    if (authored.ownedAmbient) authored.ownedAmbient.visible = false;
    return;
  }
  const owned = authored.ownedAmbient ?? new AmbientLight(0xffffff, 1);
  if (!authored.ownedAmbient) {
    owned.name = "xrift-scene-runtime-ambient";
    scene.add(owned);
    authored.ownedAmbient = owned;
  }
  owned.visible = true;
  owned.intensity = state.ambientIntensity ?? 1;
  owned.color.copy(
    state.ambientColor ? linearColor(state.ambientColor) : new Color(0xffffff),
  );
}

function applySky(
  scene: Scene,
  state: XriftSceneRuntimeState,
  authored: AuthoredScene,
  override: Texture | null,
): void {
  const touched =
    state.skybox !== null ||
    state.skyboxIbl !== null ||
    state.skyboxExposure !== null ||
    state.skyboxRotation !== null ||
    state.skyboxImage !== null;

  if (!touched) {
    if (authored.skyVisible) {
      for (const [object, visible] of authored.skyVisible) {
        object.visible = visible;
      }
      delete authored.skyVisible;
    }
    if ("background" in authored) {
      scene.background = authored.background ?? null;
      delete authored.background;
    }
    if ("environment" in authored) {
      scene.environment = authored.environment ?? null;
      delete authored.environment;
    }
    if (authored.backgroundIntensity !== undefined) {
      scene.backgroundIntensity = authored.backgroundIntensity;
      delete authored.backgroundIntensity;
    }
    if (authored.environmentIntensity !== undefined) {
      scene.environmentIntensity = authored.environmentIntensity;
      delete authored.environmentIntensity;
    }
    if (authored.backgroundRotation) {
      scene.backgroundRotation.copy(authored.backgroundRotation);
      delete authored.backgroundRotation;
    }
    if (authored.environmentRotation) {
      scene.environmentRotation.copy(authored.environmentRotation);
      delete authored.environmentRotation;
    }
    return;
  }

  if (!("background" in authored)) authored.background = scene.background;
  if (!("environment" in authored)) authored.environment = scene.environment;
  if (authored.backgroundIntensity === undefined) {
    authored.backgroundIntensity = scene.backgroundIntensity;
  }
  if (authored.environmentIntensity === undefined) {
    authored.environmentIntensity = scene.environmentIntensity;
  }
  if (!authored.backgroundRotation) {
    authored.backgroundRotation = scene.backgroundRotation.clone();
  }
  if (!authored.environmentRotation) {
    authored.environmentRotation = scene.environmentRotation.clone();
  }

  // A gradient, Box, Dome or Sky Shader sky is a mesh, so「背景を消す」is a
  // visibility change as well as a `scene.background` one.
  const skyVisible = authored.skyVisible ?? new Map<Object3D, boolean>();
  authored.skyVisible = skyVisible;
  const backgroundOn = state.skybox ?? true;
  scene.traverse((object) => {
    if (!isAuthoredSky(object)) return;
    if (!skyVisible.has(object)) skyVisible.set(object, object.visible);
    // A swapped image replaces a mesh sky too, so the mesh has to step aside.
    object.visible = backgroundOn && !override;
  });

  if (state.skybox === false) {
    scene.background = null;
  } else if (override) {
    scene.background = override;
  } else if (state.skybox === true) {
    scene.background = authored.background ?? null;
  }

  const iblOn = state.skyboxIbl;
  if (iblOn === false) {
    scene.environment = null;
  } else if (override) {
    scene.environment = override;
  } else if (iblOn === true) {
    scene.environment = authored.environment ?? null;
  }

  if (state.skyboxExposure !== null) {
    scene.backgroundIntensity = state.skyboxExposure;
    scene.environmentIntensity = state.skyboxExposure;
  }
  if (state.skyboxRotation !== null) {
    const radians = (state.skyboxRotation * Math.PI) / 180;
    scene.backgroundRotation.set(0, radians, 0);
    scene.environmentRotation.set(0, radians, 0);
  }
}

function applyCamera(
  camera: Camera,
  state: XriftSceneRuntimeState,
  authored: AuthoredScene,
): void {
  const perspective = camera as PerspectiveCamera;
  if (!Number.isFinite(perspective.fov)) return;
  if (state.cameraFov === null) {
    if (authored.cameraFov !== undefined) {
      perspective.fov = authored.cameraFov;
      perspective.updateProjectionMatrix();
      delete authored.cameraFov;
    }
    return;
  }
  if (authored.cameraFov === undefined) authored.cameraFov = perspective.fov;
  if (perspective.fov === state.cameraFov) return;
  perspective.fov = state.cameraFov;
  perspective.updateProjectionMatrix();
}

function applyEnvironment(
  scene: Scene,
  camera: Camera,
  state: XriftSceneRuntimeState,
  authored: AuthoredScene,
  override: Texture | null,
): void {
  applyFog(scene, state, authored);
  applyAmbient(scene, state, authored);
  applySky(scene, state, authored, override);
  applyCamera(camera, state, authored);
}

/** Puts every field a graph changed back, for Stop and unmount. */
function restoreAuthoredScene(
  scene: Scene,
  camera: Camera | null,
  authored: AuthoredScene,
): void {
  applyFog(scene, IDLE_STATE, authored);
  applyAmbient(scene, IDLE_STATE, authored);
  applySky(scene, IDLE_STATE, authored, null);
  // The camera can already be gone when the whole Canvas unmounts; there is
  // nothing left to restore a field of view onto in that case.
  if (camera) applyCamera(camera, IDLE_STATE, authored);
}

/**
 * Applies the Scene bridge.
 *
 * Exposure and the fade are written every frame because the compositor also
 * writes exposure whenever its settings change; the last writer each frame is
 * what the viewer sees, and a graph's exposure has to be that. Everything else
 * is applied only when the bridge's revision changes, so a world whose graph
 * never touches the sky does no per-frame work for it.
 *
 * Bloom, AO and grading are deliberately absent: `ScenePostprocessing` owns
 * those passes and reads the same bridge itself, rather than having them
 * written into it from two places.
 */
export function XriftSceneRuntime({
  enabled = true,
  assets,
}: {
  enabled?: boolean;
  /**
   * Sky images the attached graphs may switch to, by Asset id.
   *
   * The surface supplies this because only it knows where an Asset's bytes
   * are — a data URL read through Tauri in Play, a file beside the world once
   * published. The decoding and orientation stay here, so both surfaces put
   * the same image up.
   */
  assets?: Readonly<Record<string, XriftSceneRuntimeAsset>>;
}) {
  const scene = useThree((state) => state.scene);
  const bridge = useMemo(() => createXriftSceneRuntimeBridge(), []);
  const fadeRef = useRef<Mesh>(null);
  const authoredExposure = useRef<number | null>(null);
  const appliedRevision = useRef<number | null>(null);
  const skyboxTexture = useRef<SkyboxTextureState | null>(null);
  const authored = useRef<AuthoredScene>({});
  const lastCamera = useRef<Camera | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const holder = scene.userData as Record<string, unknown>;
    holder[XRIFT_SCENE_RUNTIME_USER_DATA_KEY] = bridge;
    return () => {
      delete holder[XRIFT_SCENE_RUNTIME_USER_DATA_KEY];
    };
  }, [bridge, enabled, scene]);

  useEffect(() => {
    // Stop, unmount and hot reload all land here. Everything a graph changed is
    // runtime-only, so the authored Scene has to be back before the next frame
    // draws — the same contract a Script's overrides keep.
    const owned = authored;
    const texture = skyboxTexture;
    const camera = lastCamera;
    return () => {
      restoreAuthoredScene(scene, camera.current, owned.current);
      owned.current = {};
      texture.current?.texture?.dispose();
      texture.current = null;
      appliedRevision.current = null;
    };
  }, [scene]);

  useFrame(({ camera, gl, size }) => {
    lastCamera.current = camera;
    const state = bridge.read();

    if (state.exposure === null) {
      if (authoredExposure.current !== null) {
        gl.toneMappingExposure = authoredExposure.current;
        authoredExposure.current = null;
      }
    } else {
      if (authoredExposure.current === null) {
        authoredExposure.current = gl.toneMappingExposure;
      }
      gl.toneMappingExposure = state.exposure;
    }

    if (appliedRevision.current !== state.revision) {
      appliedRevision.current = state.revision;
      syncSkyboxImage(state, assets, skyboxTexture, () => {
        // An image that finishes decoding after its write has to be put up on
        // its own: the revision it belonged to is already applied, and waiting
        // for the next one would leave the old sky there indefinitely.
        applyEnvironment(
          scene,
          camera,
          bridge.read(),
          authored.current,
          skyboxTexture.current?.texture ?? null,
        );
      });
      applyEnvironment(
        scene,
        camera,
        state,
        authored.current,
        skyboxTexture.current?.texture ?? null,
      );
    }

    const mesh = fadeRef.current;
    if (!mesh) return;
    const visible = state.fade > 0.001;
    mesh.visible = visible;
    if (!visible) return;
    const material = mesh.material as MeshBasicMaterial;
    material.opacity = state.fade;
    (material.color as Color).setRGB(
      state.fadeColor[0],
      state.fadeColor[1],
      state.fadeColor[2],
      LinearSRGBColorSpace,
    );
    // Parked just in front of the near plane and scaled to the frustum, so the
    // cover works at any field of view without a second render pass.
    const distance = 0.12;
    mesh.position.copy(camera.position);
    mesh.quaternion.copy(camera.quaternion);
    mesh.translateZ(-distance);
    const perspective = camera as PerspectiveCamera;
    const height = Number.isFinite(perspective.fov)
      ? 2 * distance * Math.tan(((perspective.fov ?? 60) * Math.PI) / 360)
      : distance * 2;
    const aspect = size.height === 0 ? 1 : size.width / size.height;
    mesh.scale.set(height * aspect * 1.2, height * 1.2, 1);
  });

  if (!enabled) return null;
  return (
    <mesh ref={fadeRef} renderOrder={10000} frustumCulled={false} visible={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        transparent
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        opacity={0}
      />
    </mesh>
  );
}
