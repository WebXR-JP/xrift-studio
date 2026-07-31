import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Object3D,
  PointLight,
  RectAreaLight,
  SpotLight,
  type ColorRepresentation,
  type Light,
} from "three";

export const XRIFT_LIGHT_RUNTIME_USER_DATA_KEY =
  "xriftLightRuntime" as const;

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
      {target ? <primitive object={target} position={[0, 0, -1]} /> : null}
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
