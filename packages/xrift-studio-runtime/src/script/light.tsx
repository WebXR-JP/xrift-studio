import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AmbientLight,
  BasicShadowMap,
  DirectionalLight,
  HemisphereLight,
  Object3D,
  PCFShadowMap,
  PCFSoftShadowMap,
  PointLight,
  RectAreaLight,
  SpotLight,
  VSMShadowMap,
  type ColorRepresentation,
  type Light,
  type Material,
  type Texture,
} from "three";

export const XRIFT_LIGHT_RUNTIME_USER_DATA_KEY =
  "xriftLightRuntime" as const;

export type XriftShadowMapType = "basic" | "pcf" | "pcfSoft" | "vsm";

export function XriftShadowMapSettings({ type }: { type: XriftShadowMapType }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    const previous = gl.shadowMap.type;
    gl.shadowMap.type = type === "basic" ? BasicShadowMap : type === "pcfSoft" ? PCFSoftShadowMap : type === "vsm" ? VSMShadowMap : PCFShadowMap;
    gl.shadowMap.needsUpdate = true;
    if (previous !== gl.shadowMap.type) {
      scene.traverse((object) => {
        const material = (object as Object3D & { material?: Material | Material[] }).material;
        for (const entry of Array.isArray(material) ? material : material ? [material] : []) entry.needsUpdate = true;
      });
    }
    invalidate();
    return () => {
      gl.shadowMap.type = previous;
      gl.shadowMap.needsUpdate = true;
    };
  }, [gl, invalidate, scene, type]);
  return null;
}

export const XRIFT_LIGHT_TYPES = [
  "ambient",
  "directional",
  "hemisphere",
  "point",
  "spot",
  "rectArea",
] as const;

export type XriftLightType = (typeof XRIFT_LIGHT_TYPES)[number];

export type XriftLightRuntimeOverrides = {
  enabled?: boolean;
  color?: ColorRepresentation;
  intensity?: number;
  /** Effective only for Point and Spot lights. */
  distance?: number;
};

export type XriftLightRuntimeState = {
  readonly revision: number;
  readonly componentId: string;
  readonly lightType: XriftLightType;
  readonly enabled: boolean;
  readonly color: ColorRepresentation;
  readonly intensity: number;
  readonly distance?: number;
};

export type XriftLightRuntimeBridge = {
  setOwner(
    owner: object,
    order: number,
    key: string,
    overrides: XriftLightRuntimeOverrides,
  ): void;
  removeOwner(owner: object): void;
  read(): Readonly<XriftLightRuntimeState>;
  /** Runtime component hook; Script hosts do not call this method. */
  configure(authored: XriftLightRuntimeOverrides): void;
};

export type XriftLightRuntimeSelector = {
  componentId?: string;
  lightType?: XriftLightType;
};

export type XriftLightRuntimeInfo = {
  readonly componentId: string;
  readonly lightType: XriftLightType;
  readonly enabled: boolean;
  readonly color: string | number;
  readonly intensity: number;
  readonly distance?: number;
};

export type XriftLightRuntimeHandle = {
  count(): number;
  setEnabled(enabled: boolean): number;
  setColor(value: string | number): number;
  setIntensity(intensity: number): number;
  setDistance(distance: number): number;
  reset(): void;
};

export type XriftLightRuntimeResources = {
  lights: XriftLightRuntimeHandle & {
    list(): readonly XriftLightRuntimeInfo[];
    select(selector: XriftLightRuntimeSelector): XriftLightRuntimeHandle;
    reset(): void;
  };
  update(): void;
  dispose(): void;
};

export type CreateXriftLightRuntimeBridgeOptions = {
  componentId: string;
  lightType: XriftLightType;
  enabled: boolean;
  color: ColorRepresentation;
  intensity: number;
  distance?: number;
};

/**
 * Owner-ordered Light overrides shared by Studio Play and generated output.
 * The bridge is DOM-free so composition and cleanup can be fixture-tested.
 */
export function createXriftLightRuntimeBridge(
  options: CreateXriftLightRuntimeBridgeOptions,
): XriftLightRuntimeBridge {
  const owners = new Map<
    object,
    {
      order: number;
      key: string;
      overrides: XriftLightRuntimeOverrides;
    }
  >();
  let authored = normalizeLightRuntimeOverrides(options);
  let state: XriftLightRuntimeState = {
    revision: 0,
    componentId: options.componentId,
    lightType: options.lightType,
    enabled: authored.enabled ?? true,
    color: authored.color ?? "#ffffff",
    intensity: authored.intensity ?? 1,
    ...(authored.distance !== undefined
      ? { distance: authored.distance }
      : {}),
  };

  const recompute = () => {
    const next: XriftLightRuntimeState = {
      revision: state.revision + 1,
      componentId: options.componentId,
      lightType: options.lightType,
      enabled: authored.enabled ?? true,
      color: authored.color ?? "#ffffff",
      intensity: authored.intensity ?? 1,
      ...(authored.distance !== undefined
        ? { distance: authored.distance }
        : {}),
    };
    const ordered = [...owners.values()].sort(
      (left, right) =>
        left.order - right.order || left.key.localeCompare(right.key),
    );
    for (const owner of ordered) {
      Object.assign(next, owner.overrides);
    }
    state = next;
  };

  return {
    setOwner(owner, order, key, overrides) {
      owners.set(owner, {
        order,
        key,
        overrides: normalizeLightRuntimeOverrides(overrides),
      });
      recompute();
    },
    removeOwner(owner) {
      if (!owners.delete(owner)) return;
      recompute();
    },
    read: () => state,
    configure(next) {
      authored = {
        ...authored,
        ...normalizeLightRuntimeOverrides(next),
      };
      recompute();
    },
  };
}

type LightOverrideField = keyof XriftLightRuntimeOverrides;

type LightOverrideLayer = {
  selector: XriftLightRuntimeSelector;
  overrides: XriftLightRuntimeOverrides;
  revisions: Partial<Record<LightOverrideField, number>>;
};

/**
 * Creates the owner-scoped `ctx.lights` implementation without React. Keeping
 * discovery here lets the host and fixtures share exactly the same Entity
 * boundary and late-mounted Light behavior.
 */
export function createXriftLightRuntimeResources({
  object3d,
  entityId,
  componentId,
  order,
}: {
  object3d: Object3D;
  entityId: string;
  componentId: string;
  order: number;
}): XriftLightRuntimeResources {
  let disposed = false;
  let nextWriteRevision = 0;
  const ownerToken = {};
  const owned = new Set<XriftLightRuntimeBridge>();
  const appliedKeys = new Map<XriftLightRuntimeBridge, string>();
  const rootLayer: LightOverrideLayer = {
    selector: {},
    overrides: {},
    revisions: {},
  };
  const layers = new Map<string, LightOverrideLayer>([
    [lightSelectorKey(rootLayer.selector), rootLayer],
  ]);
  const handles = new Map<string, XriftLightRuntimeHandle>();

  const matchingBridges = (
    selector: XriftLightRuntimeSelector,
  ): XriftLightRuntimeBridge[] => {
    if (disposed) return [];
    const matches: XriftLightRuntimeBridge[] = [];
    const seen = new Set<XriftLightRuntimeBridge>();
    forEachOwnedLightBridge(object3d, entityId, (bridge) => {
      if (seen.has(bridge) || !lightSelectorMatches(selector, bridge.read())) {
        return;
      }
      seen.add(bridge);
      matches.push(bridge);
    });
    return matches;
  };

  const synchronize = (force = false) => {
    if (disposed) return;
    const current = new Set<XriftLightRuntimeBridge>();
    forEachOwnedLightBridge(object3d, entityId, (bridge) => {
      if (current.has(bridge)) return;
      current.add(bridge);
      const overrides = mergeLightLayers(
        [...layers.values()],
        bridge.read(),
      );
      const key = JSON.stringify([
        overrides.enabled ?? null,
        overrides.color ?? null,
        overrides.intensity ?? null,
        overrides.distance ?? null,
      ]);
      if (Object.keys(overrides).length === 0) {
        if (owned.has(bridge)) bridge.removeOwner(ownerToken);
        owned.delete(bridge);
        appliedKeys.delete(bridge);
        return;
      }
      const newlyOwned = !owned.has(bridge);
      owned.add(bridge);
      if (force || newlyOwned || appliedKeys.get(bridge) !== key) {
        bridge.setOwner(ownerToken, order, componentId, overrides);
        appliedKeys.set(bridge, key);
      }
    });
    for (const bridge of [...owned]) {
      if (current.has(bridge)) continue;
      bridge.removeOwner(ownerToken);
      owned.delete(bridge);
      appliedKeys.delete(bridge);
    }
  };

  const setOverride = <Key extends LightOverrideField>(
    layer: LightOverrideLayer,
    key: Key,
    value: XriftLightRuntimeOverrides[Key],
  ): number => {
    if (disposed) return 0;
    layer.overrides[key] = value;
    nextWriteRevision += 1;
    layer.revisions[key] = nextWriteRevision;
    synchronize(true);
    return matchingBridges(layer.selector).length;
  };

  const resetLayer = (layer: LightOverrideLayer) => {
    layer.overrides = {};
    layer.revisions = {};
    synchronize(true);
  };

  const createHandle = (
    layer: LightOverrideLayer,
  ): XriftLightRuntimeHandle => ({
    count: () => matchingBridges(layer.selector).length,
    setEnabled: (value) => setOverride(layer, "enabled", Boolean(value)),
    setColor: (value) =>
      setOverride(layer, "color", normalizeScriptLightColor(value)),
    setIntensity: (value) =>
      setOverride(layer, "intensity", clampNonNegative(value)),
    setDistance(value) {
      setOverride(layer, "distance", clampNonNegative(value));
      return matchingBridges(layer.selector).filter((bridge) => {
        const { lightType } = bridge.read();
        return lightType === "point" || lightType === "spot";
      }).length;
    },
    reset: () => resetLayer(layer),
  });

  const rootHandle = createHandle(rootLayer);
  const resetAll = () => {
    for (const layer of layers.values()) {
      layer.overrides = {};
      layer.revisions = {};
    }
    for (const bridge of owned) bridge.removeOwner(ownerToken);
    owned.clear();
    appliedKeys.clear();
  };

  return {
    lights: {
      ...rootHandle,
      list: () =>
        matchingBridges({}).map((bridge) =>
          lightRuntimeInfo(bridge.read()),
        ),
      select(selector) {
        const normalized = normalizeLightSelector(selector);
        const key = lightSelectorKey(normalized);
        if (key === lightSelectorKey(rootLayer.selector)) {
          return rootHandle;
        }
        const cached = handles.get(key);
        if (cached) return cached;
        const layer: LightOverrideLayer = {
          selector: normalized,
          overrides: {},
          revisions: {},
        };
        layers.set(key, layer);
        const handle = createHandle(layer);
        handles.set(key, handle);
        return handle;
      },
      reset: resetAll,
    },
    update: () => synchronize(false),
    dispose() {
      if (disposed) return;
      resetAll();
      disposed = true;
      layers.clear();
      handles.clear();
    },
  };
}

export type XriftScriptLightProps = {
  componentId: string;
  lightType: XriftLightType;
  enabled: boolean;
  color: ColorRepresentation;
  intensity: number;
  castShadow: boolean;
  targetPosition?: [number, number, number];
  map?: Texture | null;
  shadowIntensity?: number;
  shadowStyle?: "hard" | "soft";
  shadowMapSize?: number;
  shadowMapWidth?: number;
  shadowMapHeight?: number;
  shadowRadius?: number;
  shadowBias?: number;
  shadowNormalBias?: number;
  shadowBlurSamples?: number;
  shadowAutoUpdate?: boolean;
  shadowCameraNear?: number;
  shadowCameraFar?: number;
  shadowCameraLeft?: number;
  shadowCameraRight?: number;
  shadowCameraTop?: number;
  shadowCameraBottom?: number;
  shadowFocus?: number;
  shadowAspect?: number;
  groundColor?: ColorRepresentation;
  distance?: number;
  decay?: number;
  angle?: number;
  penumbra?: number;
  width?: number;
  height?: number;
};

/**
 * One authored Light implementation for Studio and classic JSX output.
 * Script hosts discover the bridge on the concrete Three.js Light object.
 */
export function XriftScriptLight({
  componentId,
  lightType,
  enabled,
  color,
  intensity,
  castShadow,
  targetPosition = [0, 0, -1],
  map = null,
  shadowIntensity = 1,
  shadowStyle = "soft",
  shadowMapSize = 256,
  shadowMapWidth = shadowMapSize,
  shadowMapHeight = shadowMapSize,
  shadowRadius = 2,
  shadowBias = -0.0002,
  shadowNormalBias = 0.35,
  shadowBlurSamples = 8,
  shadowAutoUpdate = true,
  shadowCameraNear,
  shadowCameraFar,
  shadowCameraLeft = -120,
  shadowCameraRight = 120,
  shadowCameraTop = 120,
  shadowCameraBottom = -120,
  shadowFocus = 1,
  shadowAspect = 1,
  groundColor = "#334155",
  distance = 0,
  decay = 2,
  angle = Math.PI / 3,
  penumbra = 0.5,
  width = 1,
  height = 1,
}: XriftScriptLightProps) {
  const light = useMemo(() => createThreeLight(lightType), [lightType]);
  const target = useMemo(
    () =>
      lightType === "directional" || lightType === "spot"
        ? new Object3D()
        : null,
    [lightType],
  );
  const bridge = useMemo(
    () =>
      createXriftLightRuntimeBridge({
        componentId,
        lightType,
        enabled,
        color,
        intensity,
        ...(lightType === "point" || lightType === "spot"
          ? { distance }
          : {}),
      }),
    [componentId, lightType],
  );
  const appliedRevision = useRef(-1);

  useLayoutEffect(() => {
    const previous = light.userData[XRIFT_LIGHT_RUNTIME_USER_DATA_KEY];
    light.userData[XRIFT_LIGHT_RUNTIME_USER_DATA_KEY] = bridge;
    return () => {
      if (light.userData[XRIFT_LIGHT_RUNTIME_USER_DATA_KEY] !== bridge) {
        return;
      }
      if (previous === undefined) {
        delete light.userData[XRIFT_LIGHT_RUNTIME_USER_DATA_KEY];
      } else {
        light.userData[XRIFT_LIGHT_RUNTIME_USER_DATA_KEY] = previous;
      }
    };
  }, [bridge, light]);

  useLayoutEffect(
    () => () => {
      light.dispose();
    },
    [light],
  );

  useLayoutEffect(() => {
    bridge.configure({
      enabled,
      color,
      intensity,
      ...(lightType === "point" || lightType === "spot"
        ? { distance }
        : {}),
    });
    configureThreeLight(
      light,
      target,
      {
        castShadow,
        shadowIntensity,
        shadowStyle,
        shadowMapSize,
        shadowMapWidth,
        shadowMapHeight,
        shadowRadius,
        shadowBias,
        shadowNormalBias,
        shadowBlurSamples,
        shadowAutoUpdate,
        shadowCameraNear,
        shadowCameraFar,
        shadowCameraLeft,
        shadowCameraRight,
        shadowCameraTop,
        shadowCameraBottom,
        shadowFocus,
        shadowAspect,
        map,
        groundColor,
        distance,
        decay,
        angle,
        penumbra,
        width,
        height,
      },
    );
    const state = bridge.read();
    applyLightRuntimeState(light, state);
    appliedRevision.current = state.revision;
  }, [
    angle,
    bridge,
    castShadow,
    shadowIntensity,
    shadowStyle,
    shadowMapSize,
    shadowMapWidth,
    shadowMapHeight,
    shadowRadius,
    shadowBias,
    shadowNormalBias,
    shadowBlurSamples,
    shadowAutoUpdate,
    shadowCameraNear,
    shadowCameraFar,
    shadowCameraLeft,
    shadowCameraRight,
    shadowCameraTop,
    shadowCameraBottom,
    shadowFocus,
    shadowAspect,
    map,
    color,
    decay,
    distance,
    enabled,
    groundColor,
    height,
    intensity,
    light,
    lightType,
    penumbra,
    target,
    width,
  ]);

  useFrame(() => {
    const state = bridge.read();
    if (state.revision === appliedRevision.current) return;
    applyLightRuntimeState(light, state);
    appliedRevision.current = state.revision;
  });

  return (
    <>
      <primitive object={light} />
      {target ? <primitive object={target} position={targetPosition} /> : null}
    </>
  );
}

function createThreeLight(lightType: XriftLightType): Light {
  switch (lightType) {
    case "ambient":
      return new AmbientLight();
    case "directional":
      return new DirectionalLight();
    case "hemisphere":
      return new HemisphereLight();
    case "point":
      return new PointLight();
    case "spot":
      return new SpotLight();
    case "rectArea":
      return new RectAreaLight();
  }
}

function configureThreeLight(
  light: Light,
  target: Object3D | null,
  authored: {
    castShadow: boolean;
    shadowIntensity: number;
    shadowStyle: "hard" | "soft";
    shadowMapSize: number;
    shadowMapWidth: number;
    shadowMapHeight: number;
    shadowRadius: number;
    shadowBias: number;
    shadowNormalBias: number;
    shadowBlurSamples: number;
    shadowAutoUpdate: boolean;
    shadowCameraNear?: number;
    shadowCameraFar?: number;
    shadowCameraLeft: number;
    shadowCameraRight: number;
    shadowCameraTop: number;
    shadowCameraBottom: number;
    shadowFocus: number;
    shadowAspect: number;
    map: Texture | null;
    groundColor: ColorRepresentation;
    distance: number;
    decay: number;
    angle: number;
    penumbra: number;
    width: number;
    height: number;
  },
): void {
  if (
    light instanceof DirectionalLight ||
    light instanceof PointLight ||
    light instanceof SpotLight
  ) {
    light.castShadow = authored.castShadow;
    if (authored.castShadow) {
      // Three's defaults assume a tabletop scene: a directional shadow camera
      // spans ±5m and carries no bias. Over a Terrain that leaves a sharp
      // square where shadows exist inside and vanish outside, torn into moire
      // stripes of self-shadowing acne. The normal bias removes the acne; the
      // wide frustum removes the square.
      light.shadow.intensity = authored.shadowIntensity;
      const mapSizeChanged = light.shadow.mapSize.x !== authored.shadowMapWidth || light.shadow.mapSize.y !== authored.shadowMapHeight;
      light.shadow.mapSize.set(authored.shadowMapWidth, authored.shadowMapHeight);
      light.shadow.radius = authored.shadowStyle === "hard" ? 0 : authored.shadowRadius;
      light.shadow.bias = authored.shadowBias;
      light.shadow.normalBias = authored.shadowNormalBias;
      light.shadow.blurSamples = authored.shadowBlurSamples;
      light.shadow.autoUpdate = authored.shadowAutoUpdate;
      light.shadow.needsUpdate = true;
      if (light instanceof DirectionalLight) {
        light.shadow.camera.left = authored.shadowCameraLeft;
        light.shadow.camera.right = authored.shadowCameraRight;
        light.shadow.camera.top = authored.shadowCameraTop;
        light.shadow.camera.bottom = authored.shadowCameraBottom;
      }
      if (light instanceof SpotLight) {
        light.shadow.focus = authored.shadowFocus;
        light.shadow.aspect = authored.shadowAspect;
      }
      light.shadow.camera.near = authored.shadowCameraNear ?? (light instanceof DirectionalLight ? 1 : 0.5);
      light.shadow.camera.far = authored.shadowCameraFar ?? (light instanceof DirectionalLight ? 400 : 500);
      light.shadow.camera.updateProjectionMatrix();
      // The map may already exist at the old size when a light toggles.
      if (mapSizeChanged) {
        light.shadow.map?.dispose();
        light.shadow.map = null;
      }
    }
  }
  if (light instanceof HemisphereLight) {
    light.groundColor.set(authored.groundColor);
  }
  if (light instanceof PointLight || light instanceof SpotLight) {
    light.distance = clampNonNegative(authored.distance);
    light.decay = clampNonNegative(authored.decay);
  }
  if (light instanceof SpotLight) {
    light.angle = clamp(authored.angle, Number.EPSILON, Math.PI / 2);
    light.penumbra = clamp(authored.penumbra, 0, 1);
    light.map = authored.map;
  }
  if (light instanceof RectAreaLight) {
    light.width = clampNonNegative(authored.width);
    light.height = clampNonNegative(authored.height);
  }
  if (
    target &&
    (light instanceof DirectionalLight || light instanceof SpotLight)
  ) {
    light.target = target;
    target.updateMatrixWorld();
  }
}

function applyLightRuntimeState(
  light: Light,
  state: Readonly<XriftLightRuntimeState>,
): void {
  light.visible = state.enabled;
  light.color.set(state.color);
  light.intensity = clampNonNegative(state.intensity);
  if (
    state.distance !== undefined &&
    (light instanceof PointLight || light instanceof SpotLight)
  ) {
    light.distance = clampNonNegative(state.distance);
  }
}

function normalizeLightRuntimeOverrides(
  value: XriftLightRuntimeOverrides,
): XriftLightRuntimeOverrides {
  return {
    ...(value.enabled !== undefined ? { enabled: Boolean(value.enabled) } : {}),
    ...(value.color !== undefined ? { color: value.color } : {}),
    ...(value.intensity !== undefined
      ? { intensity: clampNonNegative(value.intensity) }
      : {}),
    ...(value.distance !== undefined
      ? { distance: clampNonNegative(value.distance) }
      : {}),
  };
}

function mergeLightLayers(
  layers: readonly LightOverrideLayer[],
  state: Readonly<XriftLightRuntimeState>,
): XriftLightRuntimeOverrides {
  const merged: XriftLightRuntimeOverrides = {};
  const revisions: Partial<Record<LightOverrideField, number>> = {};
  for (const layer of layers) {
    if (!lightSelectorMatches(layer.selector, state)) continue;
    for (const field of [
      "enabled",
      "color",
      "intensity",
      "distance",
    ] as const satisfies readonly LightOverrideField[]) {
      const revision = layer.revisions[field];
      const value = layer.overrides[field];
      if (
        (field === "distance" &&
          state.lightType !== "point" &&
          state.lightType !== "spot") ||
        revision === undefined ||
        value === undefined ||
        revision < (revisions[field] ?? -1)
      ) {
        continue;
      }
      revisions[field] = revision;
      Object.assign(merged, { [field]: value });
    }
  }
  return merged;
}

function normalizeLightSelector(
  selector: XriftLightRuntimeSelector,
): XriftLightRuntimeSelector {
  return {
    ...(typeof selector.componentId === "string" &&
    selector.componentId.trim()
      ? { componentId: selector.componentId.trim() }
      : {}),
    ...(XRIFT_LIGHT_TYPES.includes(selector.lightType as XriftLightType)
      ? { lightType: selector.lightType }
      : {}),
  };
}

function lightSelectorKey(selector: XriftLightRuntimeSelector): string {
  return JSON.stringify([
    selector.componentId ?? null,
    selector.lightType ?? null,
  ]);
}

function lightSelectorMatches(
  selector: XriftLightRuntimeSelector,
  state: Readonly<XriftLightRuntimeState>,
): boolean {
  return (
    (selector.componentId === undefined ||
      selector.componentId === state.componentId) &&
    (selector.lightType === undefined ||
      selector.lightType === state.lightType)
  );
}

function lightRuntimeInfo(
  state: Readonly<XriftLightRuntimeState>,
): XriftLightRuntimeInfo {
  return {
    componentId: state.componentId,
    lightType: state.lightType,
    enabled: state.enabled,
    color:
      typeof state.color === "string" || typeof state.color === "number"
        ? state.color
        : "#ffffff",
    intensity: clampNonNegative(state.intensity),
    ...(state.distance !== undefined
      ? { distance: clampNonNegative(state.distance) }
      : {}),
  };
}

function normalizeScriptLightColor(value: string | number): string | number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0xffffff;
  }
  const normalized = value.trim();
  return normalized || "#ffffff";
}

function forEachOwnedLightBridge(
  root: Object3D,
  entityId: string,
  callback: (bridge: XriftLightRuntimeBridge) => void,
): void {
  const visit = (object: Object3D) => {
    if (object !== root) {
      const marker = lightEntityMarker(object);
      if (marker && marker !== entityId) return;
    }
    const candidate = (
      object.userData as Record<string, unknown>
    )[XRIFT_LIGHT_RUNTIME_USER_DATA_KEY];
    if (isLightRuntimeBridge(candidate)) callback(candidate);
    for (const child of object.children) visit(child);
  };
  visit(root);
}

function isLightRuntimeBridge(
  value: unknown,
): value is XriftLightRuntimeBridge {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as XriftLightRuntimeBridge).setOwner === "function" &&
    typeof (value as XriftLightRuntimeBridge).removeOwner === "function" &&
    typeof (value as XriftLightRuntimeBridge).read === "function"
  );
}

function lightEntityMarker(object: Object3D): string | undefined {
  const data = object.userData as {
    authoringEntityId?: unknown;
    renderedEntityId?: unknown;
    xriftEntityId?: unknown;
    xriftStudioEntityId?: unknown;
  };
  const candidate =
    data.renderedEntityId ??
    data.xriftEntityId ??
    data.xriftStudioEntityId ??
    data.authoringEntityId;
  return typeof candidate === "string" ? candidate : undefined;
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : minimum;
}
