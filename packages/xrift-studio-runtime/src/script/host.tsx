import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearMipmapNearestFilter,
  LinearSRGBColorSpace,
  Mesh,
  MirroredRepeatWrapping,
  NearestFilter,
  NearestMipmapLinearFilter,
  NearestMipmapNearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  type Material,
  type Object3D,
} from "three";

import {
  type CompiledScript,
  type ScriptAssetRuntimeDescriptor,
  type ScriptAudio,
  type ScriptAudioLoadOptions,
  type ScriptAudioSourceHandle,
  type ScriptAudioSourceInfo,
  type ScriptAudioSourceSelector,
  type ScriptAudioSourceStatus,
  type ScriptAudioSources,
  type ScriptAssets,
  type ScriptContext,
  type ScriptInput,
  type ScriptInstance,
  type ScriptMaterialHandle,
  type ScriptMaterialInfo,
  type ScriptMaterialSelector,
  type ScriptMaterials,
  type ScriptMaterialTextureSlot,
  type ScriptMaterialTextureTransform,
  type ScriptParticles,
  type ScriptPropDefinition,
  type ScriptPropsDeclaration,
  type ScriptRenderProps,
  type ScriptTexture,
  type ScriptTextureLoadOptions,
} from "./api.js";
import {
  XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY,
  type XriftAudioSourceRuntimeBridge,
  type XriftAudioSourceRuntimeOverrides,
  type XriftAudioSourceRuntimeState,
} from "./audio-source.js";
import { createScriptLifecycle } from "./lifecycle.js";
import {
  XRIFT_PARTICLE_RUNTIME_USER_DATA_KEY,
  type XriftParticleRuntimeBridge,
  type XriftParticleRuntimeOverrides,
} from "./particle.js";

/**
 * Runs Script Assets on Entities.
 *
 * Shared verbatim by Studio Play and the generated world so both schedule the
 * same way. Update order is explicit rather than React mount order, because a
 * hot-reloaded Entity would otherwise jump to the end of the callback list.
 * See docs/SCRIPTING.md.
 */

const MAX_FRAME_DELTA = 0.1;
/** A script that throws this many times in a row is stopped, not silenced. */
const CONSECUTIVE_ERROR_LIMIT = 5;

export type ScriptFailure = {
  entityId: string;
  componentId: string;
  scriptName: string;
  phase: "start" | "update" | "event" | "render" | "async" | "stop";
  message: string;
  stopped: boolean;
};

export type ScriptLogEntry = {
  entityId: string;
  componentId: string;
  scriptName: string;
  values: unknown[];
};

type Registration = {
  componentId: string;
  order: number;
  update?: (delta: number) => void;
  onError: (phase: "update", error: unknown) => void;
};

type ScriptListener = {
  handler: (payload?: unknown) => void | PromiseLike<void>;
  onError?: (error: unknown) => void;
};

type ScriptRootValue = {
  register(registration: Registration): () => void;
  emit(event: string, payload?: unknown): void;
  subscribe(
    event: string,
    handler: (payload?: unknown) => void | PromiseLike<void>,
    onError?: (error: unknown) => void,
  ): () => void;
  input: ScriptInput;
  assetBaseUrl?: string;
};

const ScriptRootContext = createContext<ScriptRootValue | null>(null);

export type XriftScriptRootProps = {
  children?: ReactNode;
  /** Keys currently held. Studio feeds its Play input; worlds feed their own. */
  pressedKeys?: ReadonlySet<string>;
  /** Published project base URL used to resolve copied Asset paths. */
  assetBaseUrl?: string;
};

/** Failures are reported by each host, which knows its own Entity and script. */
export function XriftScriptRoot({
  children,
  pressedKeys,
  assetBaseUrl,
}: XriftScriptRootProps) {
  const registrations = useRef(new Map<string, Registration>());
  const listeners = useRef(new Map<string, Set<ScriptListener>>());
  const keysRef = useRef<ReadonlySet<string>>(pressedKeys ?? new Set());
  keysRef.current = pressedKeys ?? keysRef.current;

  useEffect(() => {
    if (pressedKeys) return;
    const localKeys = new Set<string>();
    keysRef.current = localKeys;
    const handleKeyDown = (event: KeyboardEvent) => {
      localKeys.add(event.code);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      localKeys.delete(event.code);
    };
    const handleBlur = () => {
      localKeys.clear();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      localKeys.clear();
    };
  }, [pressedKeys]);

  const value = useMemo<ScriptRootValue>(
    () => ({
      register(registration) {
        registrations.current.set(registration.componentId, registration);
        return () => {
          registrations.current.delete(registration.componentId);
        };
      },
      emit(event, payload) {
        for (const listener of listeners.current.get(event) ?? []) {
          invokeScriptEventHandler(
            listener.handler,
            payload,
            listener.onError,
          );
        }
      },
      subscribe(event, handler, onError) {
        const existing = listeners.current.get(event) ?? new Set();
        const listener = { handler, onError };
        existing.add(listener);
        listeners.current.set(event, existing);
        return () => {
          existing.delete(listener);
          if (existing.size === 0) listeners.current.delete(event);
        };
      },
      input: {
        isKeyDown: (code) => keysRef.current.has(code),
        pressedKeys: () => [...keysRef.current],
      },
      ...(assetBaseUrl ? { assetBaseUrl } : {}),
    }),
    [assetBaseUrl],
  );

  useFrame((_state, delta) => {
    const clamped = Math.min(delta, MAX_FRAME_DELTA);
    // Entity hierarchy order, then component order within an Entity.
    const ordered = [...registrations.current.values()].sort(
      (left, right) => left.order - right.order,
    );
    for (const registration of ordered) {
      if (!registration.update) continue;
      try {
        registration.update(clamped);
      } catch (error) {
        registration.onError("update", error);
      }
    }
  });

  useEffect(() => {
    const active = registrations.current;
    const events = listeners.current;
    return () => {
      active.clear();
      events.clear();
    };
  }, []);

  return (
    <ScriptRootContext.Provider value={value}>
      {children}
    </ScriptRootContext.Provider>
  );
}

class ScriptRenderBoundary extends Component<
  {
    children: ReactNode;
    resetKey: unknown;
    onError: (error: unknown) => void;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onError(error);
  }

  componentDidUpdate(previous: Readonly<typeof this.props>): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export type XriftScriptHostProps<
  Declaration extends ScriptPropsDeclaration = ScriptPropsDeclaration,
> = {
  script: CompiledScript<Declaration>;
  /** Authored values, already validated against the declaration. */
  properties: Record<string, unknown>;
  entityId: string;
  entityName: string;
  componentId: string;
  /** Deterministic scheduling key; lower runs first. */
  order: number;
  /** Asset IDs explicitly declared by this Script Component. */
  assetReferences?: readonly string[];
  /** Entity IDs explicitly declared by this Script Component. */
  entityReferences?: readonly string[];
  /**
   * Resolves an explicitly referenced Asset together with its runtime defaults.
   * Preferred over `resolveAssetUrl` when both are supplied.
   */
  resolveAsset?: (
    assetId: string,
  ) => ScriptAssetRuntimeDescriptor | null;
  /** @deprecated Prefer `resolveAsset` so Texture import settings are retained. */
  resolveAssetUrl?: (assetId: string) => string | null;
  /**
   * Restarts only hosts whose declared Asset descriptor set changed
   * asynchronously, including Texture import defaults.
   */
  assetResolutionKey?: string;
  resolveEntity?: (entityId: string) => Object3D | null;
  /**
   * Optional `Render` export, mounted as a child of the Entity group after
   * `start(ctx)` succeeds and supplied with that same live context.
   */
  render?: ComponentType<ScriptRenderProps<Declaration>>;
  onLog?: (entry: ScriptLogEntry) => void;
  onFailure?: (failure: ScriptFailure) => void;
};

export function XriftScriptHost<
  Declaration extends ScriptPropsDeclaration = ScriptPropsDeclaration,
>({
  script,
  properties,
  entityId,
  entityName,
  componentId,
  order,
  assetReferences = [],
  entityReferences = [],
  resolveAsset,
  resolveAssetUrl,
  assetResolutionKey = "",
  resolveEntity,
  render: Render,
  onLog,
  onFailure,
}: XriftScriptHostProps<Declaration>) {
  const root = useContext(ScriptRootContext);
  const anchorRef = useRef<Object3D>(null);
  const [ready, setReady] = useState(false);
  const [renderStopped, setRenderStopped] = useState(false);
  const [renderContext, setRenderContext] =
    useState<ScriptContext<Declaration> | null>(null);
  const lifecycleShutdownRef = useRef<(() => void) | undefined>(undefined);
  const failedRenderRef =
    useRef<ComponentType<ScriptRenderProps<Declaration>> | undefined>(
      undefined,
    );
  const propertiesRef = useRef(properties);
  propertiesRef.current = properties;
  const resolveAssetRef = useRef(resolveAsset);
  const resolveAssetUrlRef = useRef(resolveAssetUrl);
  const resolveEntityRef = useRef(resolveEntity);
  const onLogRef = useRef(onLog);
  const onFailureRef = useRef(onFailure);
  resolveAssetRef.current = resolveAsset;
  resolveAssetUrlRef.current = resolveAssetUrl;
  resolveEntityRef.current = resolveEntity;
  onLogRef.current = onLog;
  onFailureRef.current = onFailure;
  const assetReferenceKey = JSON.stringify(assetReferences);
  const entityReferenceKey = JSON.stringify(entityReferences);
  // Select stable renderer objects individually. Subscribing to the complete
  // R3F store would restart every Script when viewport size or unrelated
  // Canvas state changes.
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const renderer = useThree((state) => state.gl);
  const handleRenderError = useCallback(
    (error: unknown) => {
      failedRenderRef.current = Render;
      setRenderStopped(true);
      lifecycleShutdownRef.current?.();
      onFailureRef.current?.({
        entityId,
        componentId,
        scriptName: script.name,
        phase: "render",
        message: error instanceof Error ? error.message : String(error),
        stopped: true,
      });
    },
    [Render, componentId, entityId, script.name],
  );

  // The anchor's parent is the Entity group. Reading it this way keeps the
  // host identical in Studio and in a generated world, with no editor context.
  useEffect(() => {
    if (anchorRef.current) setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !root) return;
    if (Render && failedRenderRef.current === Render) return;
    lifecycleShutdownRef.current = undefined;
    setRenderStopped(false);
    setRenderContext(null);
    const anchor = anchorRef.current;
    const object3d = anchor?.parent;
    if (!object3d) return;

    let consecutiveErrors = 0;
    let stopped = false;
    let active = true;
    let shutdown: (() => void) | undefined;
    const unsubscribes: (() => void)[] = [];
    const allowedAssetIds = new Set(
      JSON.parse(assetReferenceKey) as readonly string[],
    );
    const allowedEntityIds = new Set(
      JSON.parse(entityReferenceKey) as readonly string[],
    );
    const resources = createScriptResources({
      object3d,
      entityId,
      componentId,
      order,
      resolveAsset: (assetId) => {
        if (!allowedAssetIds.has(assetId)) return null;
        const descriptor =
          resolveAssetRef.current?.(assetId) ??
          scriptAssetDescriptorFromUrl(
            resolveAssetUrlRef.current?.(assetId) ?? null,
          );
        return resolveScriptAssetDescriptor(
          descriptor,
          root.assetBaseUrl,
        );
      },
    });
    const elapsedStart = performance.now();
    const time = { elapsed: 0, delta: 0 };

    const fail = (phase: ScriptFailure["phase"], error: unknown) => {
      consecutiveErrors += 1;
      const shouldStop =
        phase !== "update" ||
        consecutiveErrors >= CONSECUTIVE_ERROR_LIMIT;
      if (shouldStop) stopped = true;
      onFailureRef.current?.({
        entityId,
        componentId,
        scriptName: script.name,
        phase,
        message: error instanceof Error ? error.message : String(error),
        stopped: shouldStop,
      });
      if (shouldStop) {
        if (active) setRenderStopped(true);
        shutdown?.();
      }
    };
    const lifecycle = createScriptLifecycle(
      () => active,
      (error) => fail("async", error),
    );

    const context: ScriptContext<Declaration> = {
      entity: { id: entityId, name: entityName, enabled: true },
      object3d: object3d as unknown as ScriptContext["object3d"],
      scene,
      camera,
      renderer,
      // The host is generic over every declaration, so the precise mapped type
      // only exists from the authoring side. Values are validated before here.
      props: resolveProps(
        script.props,
        propertiesRef.current,
      ) as ScriptContext<Declaration>["props"],
      time,
      input: root.input,
      lifecycle,
      assets: resources.assets,
      audioSources: resources.audioSources,
      materials: resources.materials,
      particles: resources.particles,
      find: (targetId) =>
        (active && allowedEntityIds.has(targetId)
          ? resolveEntityRef.current?.(targetId) ??
            findEntityObject(
              findScriptScope(object3d, scene),
              targetId,
            )
          : null) as unknown as ScriptContext["object3d"] | null,
      getAssetUrl: (assetId) => resources.assets.url(assetId),
      on: (event, handler) => {
        if (!active) return () => {};
        const unsubscribe = root.subscribe(
          event,
          handler,
          (error) => {
            if (active) fail("event", error);
          },
        );
        unsubscribes.push(unsubscribe);
        return unsubscribe;
      },
      emit: (event, payload) => {
        if (active) root.emit(event, payload);
      },
      log: (...values) => {
        if (!active) return;
        onLogRef.current?.({
          entityId,
          componentId,
          scriptName: script.name,
          values,
        });
      },
    };

    let instance: ScriptInstance | void;
    try {
      instance = script.start?.(context);
    } catch (error) {
      fail("start", error);
      active = false;
      for (const unsubscribe of unsubscribes) unsubscribe();
      lifecycle.dispose();
      resources.dispose();
      return;
    }
    if (stopped) {
      active = false;
      for (const unsubscribe of unsubscribes) unsubscribe();
      lifecycle.dispose();
      try {
        instance?.stop?.();
      } catch {
        // The original event failure remains the actionable diagnostic.
      }
      try {
        instance?.dispose?.();
      } catch {
        // Disposal failures must not block failed-start cleanup.
      }
      resources.dispose();
      return;
    }

    setRenderContext(context);
    let lifecycleDisposed = false;
    let unregister: (() => void) | undefined;
    shutdown = () => {
      if (lifecycleDisposed) return;
      lifecycleDisposed = true;
      active = false;
      unregister?.();
      for (const unsubscribe of unsubscribes) unsubscribe();
      lifecycle.dispose();
      try {
        instance?.stop?.();
      } catch (error) {
        fail("stop", error);
      }
      try {
        instance?.dispose?.();
      } catch {
        // Disposal failures must not block teardown of the Play session.
      }
      resources.dispose();
      setRenderContext(null);
    };
    lifecycleShutdownRef.current = shutdown;

    unregister = root.register({
      componentId,
      order,
      onError: (phase, error) => fail(phase, error),
      update: (delta) => {
        if (stopped) return;
        resources.update();
        time.delta = delta;
        time.elapsed = (performance.now() - elapsedStart) / 1000;
        // Props are read fresh even when the Script has no update callback, so
        // event handlers observe Inspector and MCP edits without a restart.
        (context as { props: unknown }).props = resolveProps(
          script.props,
          propertiesRef.current,
        );
        if (instance?.update) {
          instance.update(delta);
        }
        consecutiveErrors = 0;
      },
    });

    return () => {
      active = false;
      if (lifecycleShutdownRef.current === shutdown) {
        lifecycleShutdownRef.current = undefined;
      }
      shutdown?.();
    };
  }, [
    ready,
    root,
    script,
    Render,
    entityId,
    entityName,
    componentId,
    order,
    assetReferenceKey,
    assetResolutionKey,
    entityReferenceKey,
    scene,
    camera,
    renderer,
  ]);

  if (renderContext) {
    // EntityScriptVisual re-renders when Inspector/MCP properties change.
    // Refresh synchronously as well as in the frame callback so declarative
    // Render output observes that edit in the same React commit.
    (renderContext as { props: unknown }).props = resolveProps(
      script.props,
      properties,
    );
  }

  return (
    <>
      <object3D ref={anchorRef} visible={false} />
      {Render && renderContext && !renderStopped ? (
        <ScriptRenderBoundary
          resetKey={Render}
          onError={handleRenderError}
        >
          <Render ctx={renderContext} />
        </ScriptRenderBoundary>
      ) : null}
    </>
  );
}

/**
 * Invokes one event listener without letting either a synchronous throw or an
 * asynchronous rejection escape the owning Script host.
 *
 * @internal Exported so the shared Studio/publish behavior can be fixture-tested
 * without mounting a React Three Fiber renderer.
 */
export function invokeScriptEventHandler(
  handler: (payload?: unknown) => void | PromiseLike<void>,
  payload: unknown,
  onError?: (error: unknown) => void,
): void {
  const reportError = (error: unknown): void => {
    try {
      onError?.(error);
    } catch {
      // Error reporting must not create another unhandled rejection.
    }
  };

  try {
    const result = handler(payload);
    if (result !== undefined) {
      void Promise.resolve(result).then(undefined, reportError);
    }
  } catch (error) {
    reportError(error);
  }
}

export type ScriptResources = {
  assets: ScriptAssets;
  audioSources: ScriptAudioSources;
  materials: ScriptMaterials;
  particles: ScriptParticles;
  /** Detects Meshes that arrive after start, such as asynchronously loaded Models. */
  update(): void;
  dispose(): void;
};

type AudioSourceOverrideLayer = {
  id: number;
  selector: ScriptAudioSourceSelector;
  overrides: XriftAudioSourceRuntimeOverrides;
  playback?: "play" | "pause" | "stop";
  seekTime?: number;
  revisions: {
    volume?: number;
    loop?: number;
    playback?: number;
    seek?: number;
  };
};

type MergedAudioSourceRuntimeState = {
  overrides: XriftAudioSourceRuntimeOverrides;
  playback?: "play" | "pause" | "stop";
  playbackRevision?: number;
  seekTime?: number;
  seekRevision?: number;
};

type AppliedAudioSourceRuntimeState = {
  scalarKey: string;
  playbackRevision?: number;
  seekRevision?: number;
};

type MaterialOverrides = {
  color?: string | number;
  opacity?: number;
  emissive?: { value: string | number; intensity?: number };
  metalness?: number;
  roughness?: number;
  textures: Partial<Record<ScriptMaterialTextureSlot, Texture | null>>;
  textureTransforms: Partial<
    Record<ScriptMaterialTextureSlot, ScriptMaterialTextureTransform>
  >;
};

type MaterialTextureTransformRevisions = Partial<
  Record<
    ScriptMaterialTextureSlot,
    Partial<Record<keyof ScriptMaterialTextureTransform, number>>
  >
>;

const MATERIAL_TEXTURE_TRANSFORM_FIELDS = [
  "offset",
  "repeat",
  "center",
  "rotation",
] as const satisfies readonly (keyof ScriptMaterialTextureTransform)[];

type MaterialOverrideRevisions = {
  color?: number;
  opacity?: number;
  emissive?: number;
  metalness?: number;
  roughness?: number;
  textures: Partial<Record<ScriptMaterialTextureSlot, number>>;
  textureTransforms: MaterialTextureTransformRevisions;
};

type MaterialOverrideLayer = {
  id: number;
  selector: ScriptMaterialSelector;
  overrides: MaterialOverrides;
  revisions: MaterialOverrideRevisions;
};

type RuntimeMaterial = Material & {
  color?: { set(next: string | number): unknown };
  emissive?: { set(next: string | number): unknown };
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
  map?: Texture | null;
  normalMap?: Texture | null;
  emissiveMap?: Texture | null;
  metalnessMap?: Texture | null;
  roughnessMap?: Texture | null;
  aoMap?: Texture | null;
};

type MaterialOwner = {
  token: object;
  order: number;
  key: string;
  layerKey: string;
  layers: readonly MaterialOverrideLayer[];
};

type MaterialState = {
  original: Material | Material[];
  clones: Material[];
  assigned: Material | Material[];
  owners: MaterialOwner[];
  textureClones: ScriptMaterialTextureClonePool;
};

const materialStates = new WeakMap<Mesh, MaterialState>();

/**
 * Creates resources scoped to one Script instance. Texture and Material
 * ownership lives here so hot reload and Stop have one deterministic cleanup
 * boundary in both Studio and published worlds.
 */
export function createScriptResources({
  object3d,
  entityId,
  componentId,
  order,
  resolveAsset,
}: {
  object3d: Object3D;
  entityId: string;
  componentId: string;
  order: number;
  resolveAsset: (
    assetId: string,
  ) => ScriptAssetRuntimeDescriptor | null;
}): ScriptResources {
  let disposed = false;
  const textureLoader = new TextureLoader();
  const texturePromises = new Map<string, Promise<Texture | null>>();
  const textures = new Set<Texture>();
  const audioPromises = new Map<string, Promise<ScriptAudio | null>>();
  const audioElements = new Set<HTMLAudioElement>();
  const audioSourceOwnerToken = {};
  const materialOwnerToken = {};
  const particleOwnerToken = {};
  const ownedAudioSourceBridges = new Set<XriftAudioSourceRuntimeBridge>();
  const audioSourceAppliedStates = new Map<
    XriftAudioSourceRuntimeBridge,
    AppliedAudioSourceRuntimeState
  >();
  const ownedMeshes = new Set<Mesh>();
  const ownedParticleBridges = new Set<XriftParticleRuntimeBridge>();
  let nextAudioSourceLayerId = 1;
  let nextAudioSourceWriteRevision = 0;
  let nextAudioSourceCommandRevision = 0;
  const rootAudioSourceLayer = createAudioSourceOverrideLayer(0, {});
  const audioSourceLayers = new Map<string, AudioSourceOverrideLayer>([
    [audioSourceSelectorKey(rootAudioSourceLayer.selector), rootAudioSourceLayer],
  ]);
  const audioSourceHandles = new Map<string, ScriptAudioSourceHandle>();
  let nextMaterialLayerId = 1;
  let nextMaterialWriteRevision = 0;
  const rootMaterialLayer = createMaterialOverrideLayer(0, {});
  const materialLayers = new Map<string, MaterialOverrideLayer>([
    [materialSelectorKey(rootMaterialLayer.selector), rootMaterialLayer],
  ]);
  const materialHandles = new Map<string, ScriptMaterialHandle>();
  const particleOverrides: XriftParticleRuntimeOverrides = {};

  const assets: ScriptAssets = {
    url: (assetId) =>
      disposed ? null : resolveAsset(assetId)?.url ?? null,
    loadTexture(assetId, options = {}) {
      if (disposed) return Promise.resolve(null);
      const descriptor = resolveAsset(assetId);
      if (!descriptor?.url) return Promise.resolve(null);
      const normalized = normalizeScriptTextureOptions(
        descriptor.textureDefaults,
        options,
      );
      const key = JSON.stringify([
        assetId,
        descriptor.url,
        normalized,
      ]);
      const cached = texturePromises.get(key);
      if (cached) {
        return cached as Promise<ScriptTexture | null>;
      }
      const loading = textureLoader
        .loadAsync(descriptor.url)
        .then((texture) => {
          if (disposed) {
            texture.dispose();
            return null;
          }
          configureScriptTexture(texture, normalized);
          textures.add(texture);
          return texture;
        })
        .catch(() => null);
      texturePromises.set(key, loading);
      return loading as Promise<ScriptTexture | null>;
    },
    loadAudio(assetId, options = {}) {
      if (disposed) return Promise.resolve(null);
      const url = resolveAsset(assetId)?.url ?? null;
      if (!url || typeof globalThis.Audio !== "function") {
        return Promise.resolve(null);
      }
      const normalized = normalizeScriptAudioOptions(options);
      const key = [
        assetId,
        url,
        normalized.volume,
        normalized.loop,
        normalized.playbackRate,
        normalized.preload,
      ].join(":");
      const cached = audioPromises.get(key);
      if (cached) return cached;
      const element = new globalThis.Audio(url);
      element.volume = normalized.volume;
      element.loop = normalized.loop;
      element.playbackRate = normalized.playbackRate;
      element.preload = normalized.preload;
      audioElements.add(element);
      const player = createScriptAudioPlayer(
        element,
        () => disposed || !audioElements.has(element),
      );
      const loaded = Promise.resolve(player);
      audioPromises.set(key, loaded);
      return loaded;
    },
  };

  const listMatchingAudioSourceBridges = (
    selector: ScriptAudioSourceSelector,
  ): XriftAudioSourceRuntimeBridge[] => {
    if (disposed) return [];
    const matches: XriftAudioSourceRuntimeBridge[] = [];
    const seen = new Set<XriftAudioSourceRuntimeBridge>();
    forEachOwnedAudioSourceBridge(object3d, entityId, (bridge) => {
      if (seen.has(bridge)) return;
      seen.add(bridge);
      if (audioSourceSelectorMatches(selector, bridge.read())) {
        matches.push(bridge);
      }
    });
    return matches;
  };

  const countAudioSources = (
    selector: ScriptAudioSourceSelector,
  ): number => listMatchingAudioSourceBridges(selector).length;

  const listAudioSources = (): readonly ScriptAudioSourceInfo[] =>
    listMatchingAudioSourceBridges({}).map((bridge) =>
      scriptAudioSourceInfo(bridge.read()),
    );

  const removeAudioSourceOwner = (
    bridge: XriftAudioSourceRuntimeBridge,
  ) => {
    bridge.removeOwner(audioSourceOwnerToken);
    ownedAudioSourceBridges.delete(bridge);
    audioSourceAppliedStates.delete(bridge);
  };

  const invokeAudioSourceCommand = (
    bridge: XriftAudioSourceRuntimeBridge,
    command:
      | { type: "play" | "pause" | "stop"; revision: number }
      | { type: "seek"; time: number; revision: number },
  ): Promise<boolean> => {
    try {
      return Promise.resolve(
        bridge.command(
          audioSourceOwnerToken,
          order,
          componentId,
          command,
        ),
      ).catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  };

  const synchronizeAudioSources = (
    forceScalar = false,
    rebuildCommands = false,
  ): Map<XriftAudioSourceRuntimeBridge, Promise<boolean>> => {
    const playbackResults = new Map<
      XriftAudioSourceRuntimeBridge,
      Promise<boolean>
    >();
    if (disposed) return playbackResults;
    const currentBridges = new Set<XriftAudioSourceRuntimeBridge>();
    forEachOwnedAudioSourceBridge(object3d, entityId, (bridge) => {
      if (currentBridges.has(bridge)) return;
      currentBridges.add(bridge);
      const state = bridge.read();
      const merged = mergeAudioSourceRuntimeState(
        [...audioSourceLayers.values()],
        state,
      );
      if (!hasAudioSourceRuntimeState(merged)) {
        if (ownedAudioSourceBridges.has(bridge)) {
          removeAudioSourceOwner(bridge);
        }
        return;
      }
      const scalarKey = JSON.stringify([
        state.componentId,
        state.audioAssetId,
        merged.overrides.volume ?? null,
        merged.overrides.loop ?? null,
      ]);
      const previous = audioSourceAppliedStates.get(bridge);
      const newlyOwned = !ownedAudioSourceBridges.has(bridge);
      const commandsChanged =
        rebuildCommands ||
        previous?.playbackRevision !== merged.playbackRevision ||
        previous?.seekRevision !== merged.seekRevision;
      if (!newlyOwned && commandsChanged) {
        bridge.removeOwner(audioSourceOwnerToken);
      }
      ownedAudioSourceBridges.add(bridge);
      if (
        hasAudioSourceOverrides(merged.overrides) &&
        (forceScalar ||
          newlyOwned ||
          commandsChanged ||
          previous?.scalarKey !== scalarKey)
      ) {
        bridge.setOwner(
          audioSourceOwnerToken,
          order,
          componentId,
          merged.overrides,
        );
      } else if (
        !hasAudioSourceOverrides(merged.overrides) &&
        !commandsChanged &&
        previous?.scalarKey !== scalarKey
      ) {
        // setOwner with an empty scalar layer clears a previous volume/loop
        // override while preserving this owner's effective command.
        bridge.setOwner(
          audioSourceOwnerToken,
          order,
          componentId,
          {},
        );
      }
      if (newlyOwned || commandsChanged) {
        if (
          merged.seekTime !== undefined &&
          merged.seekRevision !== undefined
        ) {
          void invokeAudioSourceCommand(bridge, {
            type: "seek",
            time: merged.seekTime,
            revision: merged.seekRevision,
          });
        }
        if (
          merged.playback !== undefined &&
          merged.playbackRevision !== undefined
        ) {
          playbackResults.set(
            bridge,
            invokeAudioSourceCommand(bridge, {
              type: merged.playback,
              revision: merged.playbackRevision,
            }),
          );
        }
      }
      audioSourceAppliedStates.set(bridge, {
        scalarKey,
        ...(merged.playbackRevision !== undefined
          ? { playbackRevision: merged.playbackRevision }
          : {}),
        ...(merged.seekRevision !== undefined
          ? { seekRevision: merged.seekRevision }
          : {}),
      });
    });
    for (const bridge of [...ownedAudioSourceBridges]) {
      if (currentBridges.has(bridge)) continue;
      removeAudioSourceOwner(bridge);
    }
    return playbackResults;
  };

  const resetAudioSources = () => {
    for (const layer of audioSourceLayers.values()) {
      clearAudioSourceOverrideLayer(layer);
    }
    for (const bridge of [...ownedAudioSourceBridges]) {
      removeAudioSourceOwner(bridge);
    }
  };

  const resetAudioSourceLayer = (layer: AudioSourceOverrideLayer) => {
    clearAudioSourceOverrideLayer(layer);
    synchronizeAudioSources(true, true);
  };

  const commandAudioSources = (
    layer: AudioSourceOverrideLayer,
    type: "pause" | "stop" | "seek",
    time?: number,
  ): number => {
    if (disposed) return 0;
    if (type === "seek") {
      layer.seekTime = Math.max(0, time ?? 0);
      layer.revisions.seek = ++nextAudioSourceCommandRevision;
    } else {
      layer.playback = type;
      layer.revisions.playback = ++nextAudioSourceCommandRevision;
    }
    synchronizeAudioSources();
    return countAudioSources(layer.selector);
  };

  const createAudioSourceHandle = (
    layer: AudioSourceOverrideLayer,
    reset: () => void,
  ): ScriptAudioSourceHandle => ({
    count: () => countAudioSources(layer.selector),
    async play() {
      if (disposed) return 0;
      const bridges = listMatchingAudioSourceBridges(layer.selector);
      layer.playback = "play";
      layer.revisions.playback = ++nextAudioSourceCommandRevision;
      const playbackResults = synchronizeAudioSources();
      const results = await Promise.all(
        bridges.map(
          (bridge) =>
            playbackResults.get(bridge) ?? Promise.resolve(false),
        ),
      );
      return results.filter(Boolean).length;
    },
    pause: () => commandAudioSources(layer, "pause"),
    stop: () => commandAudioSources(layer, "stop"),
    seek(seconds) {
      if (!Number.isFinite(seconds)) {
        return countAudioSources(layer.selector);
      }
      return commandAudioSources(
        layer,
        "seek",
        Math.max(0, seconds),
      );
    },
    setVolume(volume) {
      if (disposed) return 0;
      if (Number.isFinite(volume)) {
        layer.overrides.volume = clampUnit(volume);
        layer.revisions.volume = ++nextAudioSourceWriteRevision;
        synchronizeAudioSources();
      }
      return countAudioSources(layer.selector);
    },
    setLoop(loop) {
      if (disposed) return 0;
      layer.overrides.loop = Boolean(loop);
      layer.revisions.loop = ++nextAudioSourceWriteRevision;
      synchronizeAudioSources();
      return countAudioSources(layer.selector);
    },
    reset,
  });

  const rootAudioSourceHandle = createAudioSourceHandle(
    rootAudioSourceLayer,
    resetAudioSources,
  );
  const audioSources: ScriptAudioSources = {
    ...rootAudioSourceHandle,
    list: listAudioSources,
    select(selector) {
      const normalized = normalizeAudioSourceSelector(selector);
      const key = audioSourceSelectorKey(normalized);
      if (key === audioSourceSelectorKey(rootAudioSourceLayer.selector)) {
        return audioSources;
      }
      const existing = audioSourceHandles.get(key);
      if (existing) return existing;
      const layer =
        audioSourceLayers.get(key) ??
        createAudioSourceOverrideLayer(
          nextAudioSourceLayerId++,
          normalized,
        );
      audioSourceLayers.set(key, layer);
      const handle = createAudioSourceHandle(layer, () => {
        if (disposed) return;
        resetAudioSourceLayer(layer);
      });
      audioSourceHandles.set(key, handle);
      return handle;
    },
    reset: resetAudioSources,
  };

  const synchronizeMaterials = (force: boolean) => {
    if (disposed) return;
    const activeLayers = [...materialLayers.values()].filter((layer) =>
      hasMaterialOverrides(layer.overrides),
    );
    const currentMeshes = new Set<Mesh>();
    forEachOwnedMesh(object3d, entityId, (mesh, meshIndex) => {
      const materialCount = materialArray(mesh.material).length;
      const matchingLayers = activeLayers.filter((layer) =>
        materialLayerMatchesMesh(
          layer,
          mesh.name,
          meshIndex,
          materialCount,
        ),
      );
      if (matchingLayers.length === 0) return;
      currentMeshes.add(mesh);
      const previousState = materialStates.get(mesh);
      const nextLayerKey = matchingLayers
        .map((layer) => layer.id)
        .join(":");
      const previousOwner = previousState?.owners.find(
        (owner) => owner.token === materialOwnerToken,
      );
      const ownerWasCurrent = Boolean(
        previousState &&
          sameMaterialAssignment(mesh.material, previousState.assigned) &&
          previousOwner?.layerKey === nextLayerKey,
      );
      const { owner, state } = ensureMaterialOwner(
        mesh,
        materialOwnerToken,
        order,
        componentId,
      );
      ownedMeshes.add(mesh);
      owner.layers = matchingLayers;
      owner.layerKey = nextLayerKey;
      if (force || !ownerWasCurrent) applyMaterialState(state);
    });
    for (const mesh of [...ownedMeshes]) {
      if (currentMeshes.has(mesh)) continue;
      removeMaterialOwner(mesh, materialOwnerToken);
      ownedMeshes.delete(mesh);
    }
  };

  const listMaterials = (): readonly ScriptMaterialInfo[] => {
    if (disposed) return [];
    const entries: ScriptMaterialInfo[] = [];
    forEachOwnedMesh(object3d, entityId, (mesh, meshIndex) => {
      materialArray(mesh.material).forEach((material, materialIndex) => {
        entries.push({
          meshName: mesh.name,
          meshIndex,
          materialIndex,
          materialName: material.name,
        });
      });
    });
    return entries;
  };

  const countMaterials = (
    selector: ScriptMaterialSelector,
    supports: (material: Material) => boolean = () => true,
  ): number => {
    if (disposed) return 0;
    let supported = 0;
    forEachOwnedMesh(object3d, entityId, (mesh, meshIndex) => {
      if (!materialSelectorMatchesMesh(selector, mesh.name, meshIndex)) return;
      materialArray(mesh.material).forEach((material, materialIndex) => {
        if (
          materialSelectorMatchesSlot(selector, materialIndex) &&
          supports(material)
        ) {
          supported += 1;
        }
      });
    });
    return supported;
  };

  const resetMaterials = () => {
    for (const layer of materialLayers.values()) {
      clearMaterialOverrideLayer(layer);
    }
    for (const mesh of ownedMeshes) {
      removeMaterialOwner(mesh, materialOwnerToken);
    }
    ownedMeshes.clear();
  };

  const createMaterialHandle = (
    layer: MaterialOverrideLayer,
    reset: () => void,
  ): ScriptMaterialHandle => {
    const commit = (
      supports: (material: Material) => boolean,
    ): number => {
      if (disposed) return 0;
      synchronizeMaterials(true);
      return countMaterials(layer.selector, supports);
    };
    return {
      count: () => countMaterials(layer.selector),
      setColor(value) {
        if (disposed) return 0;
        layer.overrides.color = value;
        layer.revisions.color = ++nextMaterialWriteRevision;
        return commit(
          (material) => Boolean(scriptMaterial(material).color),
        );
      },
      setOpacity(value) {
        if (disposed) return 0;
        layer.overrides.opacity = clampUnit(value);
        layer.revisions.opacity = ++nextMaterialWriteRevision;
        return commit(() => true);
      },
      setEmissive(value, intensity) {
        if (disposed) return 0;
        const resolvedIntensity =
          intensity !== undefined && Number.isFinite(intensity)
            ? Math.max(0, intensity)
            : undefined;
        layer.overrides.emissive = {
          value,
          intensity: resolvedIntensity,
        };
        layer.revisions.emissive = ++nextMaterialWriteRevision;
        return commit(
          (material) => Boolean(scriptMaterial(material).emissive),
        );
      },
      setMetalness(value) {
        if (disposed) return 0;
        layer.overrides.metalness = clampUnit(value);
        layer.revisions.metalness = ++nextMaterialWriteRevision;
        return commit(
          (material) =>
            typeof scriptMaterial(material).metalness === "number",
        );
      },
      setRoughness(value) {
        if (disposed) return 0;
        layer.overrides.roughness = clampUnit(value);
        layer.revisions.roughness = ++nextMaterialWriteRevision;
        return commit(
          (material) =>
            typeof scriptMaterial(material).roughness === "number",
        );
      },
      setTexture(slot, texture) {
        if (disposed) return 0;
        const resolved =
          texture instanceof Texture || texture?.isTexture === true
            ? (texture as unknown as Texture)
            : null;
        layer.overrides.textures[slot] = resolved;
        layer.revisions.textures[slot] = ++nextMaterialWriteRevision;
        return commit((material) =>
          supportsMaterialTexture(material, slot),
        );
      },
      setTextureTransform(slot, transform) {
        if (disposed) return 0;
        const normalized = normalizeMaterialTextureTransform(transform);
        const fields = Object.keys(
          normalized,
        ) as Array<keyof ScriptMaterialTextureTransform>;
        if (fields.length > 0) {
          const current = {
            ...layer.overrides.textureTransforms[slot],
          };
          const revisions = {
            ...layer.revisions.textureTransforms[slot],
          };
          for (const field of fields) {
            assignMaterialTextureTransformField(
              current,
              field,
              normalized[field],
            );
            revisions[field] = ++nextMaterialWriteRevision;
          }
          layer.overrides.textureTransforms[slot] = current;
          layer.revisions.textureTransforms[slot] = revisions;
        }
        return commit((material) =>
          supportsMaterialTexture(material, slot),
        );
      },
      resetTextureTransform(slot) {
        if (disposed) return 0;
        delete layer.overrides.textureTransforms[slot];
        delete layer.revisions.textureTransforms[slot];
        synchronizeMaterials(true);
        return countMaterials(layer.selector, (material) =>
          supportsMaterialTexture(material, slot),
        );
      },
      reset,
    };
  };

  const rootMaterialHandle = createMaterialHandle(
    rootMaterialLayer,
    resetMaterials,
  );
  const materials: ScriptMaterials = {
    ...rootMaterialHandle,
    list: listMaterials,
    select(selector) {
      const normalized = normalizeMaterialSelector(selector);
      const key = materialSelectorKey(normalized);
      if (key === materialSelectorKey(rootMaterialLayer.selector)) {
        return materials;
      }
      const existing = materialHandles.get(key);
      if (existing) return existing;
      const layer =
        materialLayers.get(key) ??
        createMaterialOverrideLayer(nextMaterialLayerId++, normalized);
      materialLayers.set(key, layer);
      const handle = createMaterialHandle(layer, () => {
        if (disposed) return;
        clearMaterialOverrideLayer(layer);
        synchronizeMaterials(true);
      });
      materialHandles.set(key, handle);
      return handle;
    },
    reset: resetMaterials,
  };

  const countParticles = (): number => {
    if (disposed) return 0;
    const bridges = new Set<XriftParticleRuntimeBridge>();
    forEachOwnedParticleBridge(object3d, entityId, (bridge) => {
      bridges.add(bridge);
    });
    return bridges.size;
  };

  const resetParticles = () => {
    for (const bridge of ownedParticleBridges) {
      bridge.removeOwner(particleOwnerToken);
    }
    ownedParticleBridges.clear();
    for (const key of Object.keys(
      particleOverrides,
    ) as Array<keyof XriftParticleRuntimeOverrides>) {
      delete particleOverrides[key];
    }
  };

  const synchronizeParticles = (force: boolean) => {
    if (disposed || Object.keys(particleOverrides).length === 0) return;
    const current = new Set<XriftParticleRuntimeBridge>();
    forEachOwnedParticleBridge(object3d, entityId, (bridge) => {
      current.add(bridge);
      const newlyOwned = !ownedParticleBridges.has(bridge);
      ownedParticleBridges.add(bridge);
      if (force || newlyOwned) {
        bridge.setOwner(
          particleOwnerToken,
          order,
          componentId,
          particleOverrides,
        );
      }
    });
    for (const bridge of [...ownedParticleBridges]) {
      if (current.has(bridge)) continue;
      bridge.removeOwner(particleOwnerToken);
      ownedParticleBridges.delete(bridge);
    }
  };

  const setParticleOverride = <Key extends keyof XriftParticleRuntimeOverrides>(
    key: Key,
    value: XriftParticleRuntimeOverrides[Key],
  ): number => {
    if (disposed || Object.is(particleOverrides[key], value)) {
      return countParticles();
    }
    particleOverrides[key] = value;
    synchronizeParticles(true);
    return countParticles();
  };

  let particleRestartRevision = 0;
  const particles: ScriptParticles = {
    count: countParticles,
    play() {
      particleOverrides.stopped = false;
      return setParticleOverride("playing", true);
    },
    pause() {
      particleOverrides.stopped = false;
      return setParticleOverride("playing", false);
    },
    stop() {
      particleOverrides.playing = false;
      return setParticleOverride("stopped", true);
    },
    restart() {
      particleOverrides.playing = true;
      particleOverrides.stopped = false;
      particleRestartRevision += 1;
      return setParticleOverride("restartRevision", particleRestartRevision);
    },
    setEmissionRate(value) {
      return setParticleOverride("emissionRate", clampNonNegative(value));
    },
    setSpeedMultiplier(value) {
      return setParticleOverride("speedMultiplier", clampNonNegative(value));
    },
    setSizeMultiplier(value) {
      return setParticleOverride("sizeMultiplier", clampNonNegative(value));
    },
    setColor: (value) => setParticleOverride("color", value),
    setOpacity: (value) => setParticleOverride("opacity", clampUnit(value)),
    reset: resetParticles,
  };

  return {
    assets,
    audioSources,
    materials,
    particles,
    update() {
      synchronizeAudioSources(false);
      synchronizeMaterials(false);
      synchronizeParticles(false);
    },
    dispose() {
      if (disposed) return;
      resetAudioSources();
      resetMaterials();
      resetParticles();
      disposed = true;
      for (const texture of textures) texture.dispose();
      textures.clear();
      texturePromises.clear();
      for (const element of audioElements) {
        releaseScriptAudioElement(element);
      }
      audioElements.clear();
      audioPromises.clear();
    },
  };
}

const SAFE_SCRIPT_TEXTURE_OPTIONS: Required<ScriptTextureLoadOptions> = {
  colorSpace: "auto",
  wrapS: "clamp-to-edge",
  wrapT: "clamp-to-edge",
  magFilter: "linear",
  minFilter: "linear-mipmap-linear",
  generateMipmaps: true,
  flipY: true,
};

/**
 * Merges Three-compatible defaults, Texture Asset import settings, and the
 * Script call's explicit options in that order.
 *
 * @internal Exported for the shared Studio/publish contract fixture.
 */
export function normalizeScriptTextureOptions(
  assetDefaults: ScriptTextureLoadOptions | undefined,
  options: ScriptTextureLoadOptions = {},
): Required<ScriptTextureLoadOptions> {
  const normalized = { ...SAFE_SCRIPT_TEXTURE_OPTIONS };
  mergeValidScriptTextureOptions(normalized, assetDefaults);
  mergeValidScriptTextureOptions(normalized, options);
  if (
    !normalized.generateMipmaps &&
    normalized.minFilter.includes("-mipmap-")
  ) {
    normalized.minFilter = "linear";
  }
  return normalized;
}

function mergeValidScriptTextureOptions(
  target: Required<ScriptTextureLoadOptions>,
  source: ScriptTextureLoadOptions | undefined,
): void {
  if (!source) return;
  if (
    source.colorSpace === "auto" ||
    source.colorSpace === "srgb" ||
    source.colorSpace === "linear"
  ) {
    target.colorSpace = source.colorSpace;
  }
  if (
    source.wrapS === "repeat" ||
    source.wrapS === "clamp-to-edge" ||
    source.wrapS === "mirrored-repeat"
  ) {
    target.wrapS = source.wrapS;
  }
  if (
    source.wrapT === "repeat" ||
    source.wrapT === "clamp-to-edge" ||
    source.wrapT === "mirrored-repeat"
  ) {
    target.wrapT = source.wrapT;
  }
  if (source.magFilter === "nearest" || source.magFilter === "linear") {
    target.magFilter = source.magFilter;
  }
  if (
    source.minFilter === "nearest" ||
    source.minFilter === "linear" ||
    source.minFilter === "nearest-mipmap-nearest" ||
    source.minFilter === "linear-mipmap-nearest" ||
    source.minFilter === "nearest-mipmap-linear" ||
    source.minFilter === "linear-mipmap-linear"
  ) {
    target.minFilter = source.minFilter;
  }
  if (typeof source.generateMipmaps === "boolean") {
    target.generateMipmaps = source.generateMipmaps;
  }
  if (typeof source.flipY === "boolean") target.flipY = source.flipY;
}

/** @internal Exported for the shared runtime contract fixture. */
export function normalizeScriptAudioOptions(
  options: ScriptAudioLoadOptions,
): Required<ScriptAudioLoadOptions> {
  return {
    volume:
      typeof options.volume === "number" && Number.isFinite(options.volume)
        ? clampUnit(options.volume)
        : 1,
    loop: options.loop === true,
    playbackRate:
      typeof options.playbackRate === "number" &&
      Number.isFinite(options.playbackRate) &&
      options.playbackRate > 0
        ? options.playbackRate
        : 1,
    preload:
      options.preload === "none" ||
      options.preload === "metadata" ||
      options.preload === "auto"
        ? options.preload
        : "auto",
  };
}

/** @internal Exported for the shared runtime contract fixture. */
export function createScriptAudioPlayer(
  element: HTMLAudioElement,
  unavailable: () => boolean,
): ScriptAudio {
  return {
    async play() {
      if (unavailable()) return;
      await element.play();
    },
    pause() {
      if (!unavailable()) element.pause();
    },
    stop() {
      if (unavailable()) return;
      element.pause();
      setScriptAudioCurrentTime(element, 0);
    },
    seek(seconds) {
      if (unavailable() || !Number.isFinite(seconds)) return;
      const maximum =
        Number.isFinite(element.duration) && element.duration > 0
          ? element.duration
          : Number.POSITIVE_INFINITY;
      setScriptAudioCurrentTime(
        element,
        Math.min(maximum, Math.max(0, seconds)),
      );
    },
    setVolume(volume) {
      if (!unavailable() && Number.isFinite(volume)) {
        element.volume = clampUnit(volume);
      }
    },
    setLoop(loop) {
      if (!unavailable()) element.loop = Boolean(loop);
    },
    setPlaybackRate(playbackRate) {
      if (
        !unavailable() &&
        Number.isFinite(playbackRate) &&
        playbackRate > 0
      ) {
        element.playbackRate = playbackRate;
      }
    },
    get playing() {
      return !unavailable() && !element.paused && !element.ended;
    },
    get currentTime() {
      return unavailable() || !Number.isFinite(element.currentTime)
        ? 0
        : element.currentTime;
    },
    get duration() {
      return unavailable() || !Number.isFinite(element.duration)
        ? 0
        : element.duration;
    },
  };
}

function setScriptAudioCurrentTime(
  element: HTMLAudioElement,
  seconds: number,
): void {
  try {
    element.currentTime = seconds;
  } catch {
    // Some browsers reject seeks before metadata is available. The player
    // remains usable and a later explicit seek can succeed.
  }
}

/** @internal Exported for the shared runtime contract fixture. */
export function releaseScriptAudioElement(element: HTMLAudioElement): void {
  element.pause();
  setScriptAudioCurrentTime(element, 0);
  element.removeAttribute("src");
  element.load();
}

function createAudioSourceOverrideLayer(
  id: number,
  selector: ScriptAudioSourceSelector,
): AudioSourceOverrideLayer {
  return {
    id,
    selector,
    overrides: {},
    revisions: {},
  };
}

function clearAudioSourceOverrideLayer(
  layer: AudioSourceOverrideLayer,
): void {
  delete layer.overrides.volume;
  delete layer.overrides.loop;
  delete layer.playback;
  delete layer.seekTime;
  delete layer.revisions.volume;
  delete layer.revisions.loop;
  delete layer.revisions.playback;
  delete layer.revisions.seek;
}

function normalizeAudioSourceSelector(
  selector: ScriptAudioSourceSelector,
): ScriptAudioSourceSelector {
  const normalized: ScriptAudioSourceSelector = {};
  if (typeof selector?.componentId === "string") {
    normalized.componentId = selector.componentId;
  }
  if (typeof selector?.audioAssetId === "string") {
    normalized.audioAssetId = selector.audioAssetId;
  }
  return normalized;
}

function audioSourceSelectorKey(
  selector: ScriptAudioSourceSelector,
): string {
  return JSON.stringify([
    selector.componentId ?? null,
    selector.audioAssetId ?? null,
  ]);
}

function audioSourceSelectorMatches(
  selector: ScriptAudioSourceSelector,
  state: Readonly<XriftAudioSourceRuntimeState>,
): boolean {
  return (
    (selector.componentId === undefined ||
      selector.componentId === state.componentId) &&
    (selector.audioAssetId === undefined ||
      selector.audioAssetId === state.audioAssetId)
  );
}

function mergeAudioSourceRuntimeState(
  layers: readonly AudioSourceOverrideLayer[],
  state: Readonly<XriftAudioSourceRuntimeState>,
): MergedAudioSourceRuntimeState {
  const merged: MergedAudioSourceRuntimeState = { overrides: {} };
  let volumeRevision: number | undefined;
  let loopRevision: number | undefined;
  for (const layer of layers) {
    if (!audioSourceSelectorMatches(layer.selector, state)) continue;
    if (
      layer.overrides.volume !== undefined &&
      layer.revisions.volume !== undefined &&
      (volumeRevision === undefined ||
        layer.revisions.volume > volumeRevision)
    ) {
      merged.overrides.volume = layer.overrides.volume;
      volumeRevision = layer.revisions.volume;
    }
    if (
      layer.overrides.loop !== undefined &&
      layer.revisions.loop !== undefined &&
      (loopRevision === undefined || layer.revisions.loop > loopRevision)
    ) {
      merged.overrides.loop = layer.overrides.loop;
      loopRevision = layer.revisions.loop;
    }
    if (
      layer.playback !== undefined &&
      layer.revisions.playback !== undefined &&
      (merged.playbackRevision === undefined ||
        layer.revisions.playback > merged.playbackRevision)
    ) {
      merged.playback = layer.playback;
      merged.playbackRevision = layer.revisions.playback;
    }
    if (
      layer.seekTime !== undefined &&
      layer.revisions.seek !== undefined &&
      (merged.seekRevision === undefined ||
        layer.revisions.seek > merged.seekRevision)
    ) {
      merged.seekTime = layer.seekTime;
      merged.seekRevision = layer.revisions.seek;
    }
  }
  return merged;
}

function hasAudioSourceOverrides(
  overrides: XriftAudioSourceRuntimeOverrides,
): boolean {
  return overrides.volume !== undefined || overrides.loop !== undefined;
}

function hasAudioSourceRuntimeState(
  state: MergedAudioSourceRuntimeState,
): boolean {
  return (
    hasAudioSourceOverrides(state.overrides) ||
    state.playback !== undefined ||
    state.seekTime !== undefined
  );
}

function scriptAudioSourceInfo(
  state: Readonly<XriftAudioSourceRuntimeState>,
): ScriptAudioSourceInfo {
  return {
    componentId: state.componentId,
    audioAssetId: state.audioAssetId,
    spatial: state.spatial,
    status: scriptAudioSourceStatus(state.status),
    playing: state.playing,
    currentTime:
      Number.isFinite(state.currentTime) && state.currentTime >= 0
        ? state.currentTime
        : 0,
    duration:
      Number.isFinite(state.duration) && state.duration >= 0
        ? state.duration
        : 0,
    volume: clampUnit(state.volume),
    loop: state.loop,
  };
}

function scriptAudioSourceStatus(
  status: XriftAudioSourceRuntimeState["status"],
): ScriptAudioSourceStatus {
  return status;
}

function createMaterialOverrideLayer(
  id: number,
  selector: ScriptMaterialSelector,
): MaterialOverrideLayer {
  return {
    id,
    selector,
    overrides: { textures: {}, textureTransforms: {} },
    revisions: { textures: {}, textureTransforms: {} },
  };
}

function clearMaterialOverrideLayer(layer: MaterialOverrideLayer): void {
  delete layer.overrides.color;
  delete layer.overrides.opacity;
  delete layer.overrides.emissive;
  delete layer.overrides.metalness;
  delete layer.overrides.roughness;
  layer.overrides.textures = {};
  layer.overrides.textureTransforms = {};
  delete layer.revisions.color;
  delete layer.revisions.opacity;
  delete layer.revisions.emissive;
  delete layer.revisions.metalness;
  delete layer.revisions.roughness;
  layer.revisions.textures = {};
  layer.revisions.textureTransforms = {};
}

function normalizeMaterialSelector(
  selector: ScriptMaterialSelector,
): ScriptMaterialSelector {
  const normalized: ScriptMaterialSelector = {};
  if (typeof selector.meshName === "string") {
    normalized.meshName = selector.meshName;
  }
  if (selector.meshIndex !== undefined) {
    normalized.meshIndex =
      Number.isInteger(selector.meshIndex) && selector.meshIndex >= 0
        ? selector.meshIndex
        : -1;
  }
  if (selector.materialIndex !== undefined) {
    normalized.materialIndex =
      Number.isInteger(selector.materialIndex) && selector.materialIndex >= 0
        ? selector.materialIndex
        : -1;
  }
  return normalized;
}

function materialSelectorKey(selector: ScriptMaterialSelector): string {
  return JSON.stringify([
    selector.meshName ?? null,
    selector.meshIndex ?? null,
    selector.materialIndex ?? null,
  ]);
}

function materialSelectorMatchesMesh(
  selector: ScriptMaterialSelector,
  meshName: string,
  meshIndex: number,
): boolean {
  return (
    (selector.meshName === undefined || selector.meshName === meshName) &&
    (selector.meshIndex === undefined || selector.meshIndex === meshIndex)
  );
}

function materialSelectorMatchesSlot(
  selector: ScriptMaterialSelector,
  materialIndex: number,
): boolean {
  return (
    selector.materialIndex === undefined ||
    selector.materialIndex === materialIndex
  );
}

function materialLayerMatchesMesh(
  layer: MaterialOverrideLayer,
  meshName: string,
  meshIndex: number,
  materialCount: number,
): boolean {
  return (
    materialSelectorMatchesMesh(layer.selector, meshName, meshIndex) &&
    (layer.selector.materialIndex === undefined ||
      layer.selector.materialIndex < materialCount)
  );
}

function ensureMaterialOwner(
  mesh: Mesh,
  token: object,
  order: number,
  key: string,
): { owner: MaterialOwner; state: MaterialState } {
  let state = materialStates.get(mesh);
  if (state && !sameMaterialAssignment(mesh.material, state.assigned)) {
    disposeMaterialState(state);
    materialStates.delete(mesh);
    state = undefined;
  }
  if (!state) {
    const original = mesh.material;
    const originals = materialArray(original);
    const clones = originals.map((material) => material.clone());
    const assigned = Array.isArray(original) ? clones : clones[0]!;
    state = {
      original,
      clones,
      assigned,
      owners: [],
      textureClones: new ScriptMaterialTextureClonePool(),
    };
    materialStates.set(mesh, state);
    mesh.material = assigned;
  }
  let owner = state.owners.find((candidate) => candidate.token === token);
  if (!owner) {
    owner = {
      token,
      order,
      key,
      layerKey: "",
      layers: [],
    };
    state.owners.push(owner);
    state.owners.sort(
      (left, right) =>
        left.order - right.order || left.key.localeCompare(right.key),
    );
  }
  return { owner, state };
}

function removeMaterialOwner(mesh: Mesh, token: object): void {
  const state = materialStates.get(mesh);
  if (!state) return;
  const ownerIndex = state.owners.findIndex((owner) => owner.token === token);
  if (ownerIndex < 0) return;
  state.owners.splice(ownerIndex, 1);
  if (state.owners.length > 0) {
    applyMaterialState(state);
    return;
  }
  if (sameMaterialAssignment(mesh.material, state.assigned)) {
    mesh.material = state.original;
  }
  disposeMaterialState(state);
  materialStates.delete(mesh);
}

function applyMaterialState(state: MaterialState): void {
  const originals = materialArray(state.original);
  const previousTextureUsage = state.clones.map(materialTextureUsage);
  const activeTextureCloneKeys = new Set<string>();
  state.clones.forEach((clone, index) => {
    clone.copy(originals[index] ?? originals[0]!);
    const overrides = mergeMaterialOverrides(state.owners, index);
    applyMaterialOverrides(clone, overrides);
    applyMaterialTextureTransforms(
      state,
      index,
      clone,
      overrides.textureTransforms,
      activeTextureCloneKeys,
    );
  });
  state.textureClones.releaseUnused(activeTextureCloneKeys);
  state.clones.forEach((clone, index) => {
    if (materialTextureUsage(clone) !== previousTextureUsage[index]) {
      clone.needsUpdate = true;
    }
  });
}

function mergeMaterialOverrides(
  owners: readonly MaterialOwner[],
  materialIndex: number,
): MaterialOverrides {
  const merged: MaterialOverrides = {
    textures: {},
    textureTransforms: {},
  };
  for (const owner of owners) {
    const overrides = mergeMaterialOwnerLayers(owner.layers, materialIndex);
    if (overrides.color !== undefined) merged.color = overrides.color;
    if (overrides.opacity !== undefined) merged.opacity = overrides.opacity;
    if (overrides.emissive !== undefined) {
      merged.emissive = { ...overrides.emissive };
    }
    if (overrides.metalness !== undefined) {
      merged.metalness = overrides.metalness;
    }
    if (overrides.roughness !== undefined) {
      merged.roughness = overrides.roughness;
    }
    Object.assign(merged.textures, overrides.textures);
    mergeMaterialTextureTransforms(
      merged.textureTransforms,
      overrides.textureTransforms,
    );
  }
  return merged;
}

function mergeMaterialOwnerLayers(
  layers: readonly MaterialOverrideLayer[],
  materialIndex: number,
): MaterialOverrides {
  const merged: MaterialOverrides = {
    textures: {},
    textureTransforms: {},
  };
  const revisions: MaterialOverrideRevisions = {
    textures: {},
    textureTransforms: {},
  };
  for (const layer of layers) {
    if (!materialSelectorMatchesSlot(layer.selector, materialIndex)) continue;
    if (
      layer.overrides.color !== undefined &&
      newerMaterialRevision(layer.revisions.color, revisions.color)
    ) {
      merged.color = layer.overrides.color;
      revisions.color = layer.revisions.color;
    }
    if (
      layer.overrides.opacity !== undefined &&
      newerMaterialRevision(layer.revisions.opacity, revisions.opacity)
    ) {
      merged.opacity = layer.overrides.opacity;
      revisions.opacity = layer.revisions.opacity;
    }
    if (
      layer.overrides.emissive !== undefined &&
      newerMaterialRevision(layer.revisions.emissive, revisions.emissive)
    ) {
      merged.emissive = { ...layer.overrides.emissive };
      revisions.emissive = layer.revisions.emissive;
    }
    if (
      layer.overrides.metalness !== undefined &&
      newerMaterialRevision(layer.revisions.metalness, revisions.metalness)
    ) {
      merged.metalness = layer.overrides.metalness;
      revisions.metalness = layer.revisions.metalness;
    }
    if (
      layer.overrides.roughness !== undefined &&
      newerMaterialRevision(layer.revisions.roughness, revisions.roughness)
    ) {
      merged.roughness = layer.overrides.roughness;
      revisions.roughness = layer.revisions.roughness;
    }
    for (const slot of Object.keys(
      layer.revisions.textures,
    ) as ScriptMaterialTextureSlot[]) {
      const revision = layer.revisions.textures[slot];
      if (
        revision !== undefined &&
        newerMaterialRevision(revision, revisions.textures[slot])
      ) {
        merged.textures[slot] = layer.overrides.textures[slot] ?? null;
        revisions.textures[slot] = revision;
      }
    }
    for (const slot of Object.keys(
      layer.revisions.textureTransforms,
    ) as ScriptMaterialTextureSlot[]) {
      const fieldRevisions =
        layer.revisions.textureTransforms[slot];
      if (!fieldRevisions) continue;
      for (const field of MATERIAL_TEXTURE_TRANSFORM_FIELDS) {
        const revision = fieldRevisions[field];
        const currentRevision =
          revisions.textureTransforms[slot]?.[field];
        if (
          revision === undefined ||
          !newerMaterialRevision(revision, currentRevision)
        ) {
          continue;
        }
        const value =
          layer.overrides.textureTransforms[slot]?.[field];
        if (value === undefined) continue;
        const transform =
          merged.textureTransforms[slot] ?? {};
        assignMaterialTextureTransformField(
          transform,
          field,
          value,
        );
        merged.textureTransforms[slot] = transform;
        const mergedRevisions =
          revisions.textureTransforms[slot] ?? {};
        mergedRevisions[field] = revision;
        revisions.textureTransforms[slot] = mergedRevisions;
      }
    }
  }
  return merged;
}

function newerMaterialRevision(
  candidate: number | undefined,
  current: number | undefined,
): boolean {
  return candidate !== undefined && (current === undefined || candidate > current);
}

function mergeMaterialTextureTransforms(
  target: MaterialOverrides["textureTransforms"],
  source: MaterialOverrides["textureTransforms"],
): void {
  for (const slot of Object.keys(
    source,
  ) as ScriptMaterialTextureSlot[]) {
    const sourceTransform = source[slot];
    if (!sourceTransform) continue;
    const targetTransform = target[slot] ?? {};
    for (const field of MATERIAL_TEXTURE_TRANSFORM_FIELDS) {
      const value = sourceTransform[field];
      if (value === undefined) continue;
      assignMaterialTextureTransformField(
        targetTransform,
        field,
        value,
      );
    }
    target[slot] = targetTransform;
  }
}

function normalizeMaterialTextureTransform(
  transform: ScriptMaterialTextureTransform,
): ScriptMaterialTextureTransform {
  const normalized: ScriptMaterialTextureTransform = {};
  if (isFiniteScriptVec2(transform?.offset)) {
    normalized.offset = [...transform.offset];
  }
  if (isFiniteScriptVec2(transform?.repeat)) {
    normalized.repeat = [...transform.repeat];
  }
  if (isFiniteScriptVec2(transform?.center)) {
    normalized.center = [...transform.center];
  }
  if (
    typeof transform?.rotation === "number" &&
    Number.isFinite(transform.rotation)
  ) {
    normalized.rotation = transform.rotation;
  }
  return normalized;
}

function assignMaterialTextureTransformField(
  target: ScriptMaterialTextureTransform,
  field: keyof ScriptMaterialTextureTransform,
  value: ScriptMaterialTextureTransform[keyof ScriptMaterialTextureTransform],
): void {
  if (field === "rotation") {
    if (typeof value === "number" && Number.isFinite(value)) {
      target.rotation = value;
    }
    return;
  }
  if (!isFiniteScriptVec2(value)) return;
  if (field === "offset") target.offset = [...value];
  else if (field === "repeat") target.repeat = [...value];
  else target.center = [...value];
}

function isFiniteScriptVec2(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    )
  );
}

function applyMaterialOverrides(
  material: Material,
  overrides: MaterialOverrides,
): void {
  const target = scriptMaterial(material);
  if (overrides.color !== undefined) target.color?.set(overrides.color);
  if (overrides.opacity !== undefined) {
    material.opacity = overrides.opacity;
    material.transparent = overrides.opacity < 1;
    if (overrides.opacity < 1) material.depthWrite = false;
  }
  if (overrides.emissive) {
    target.emissive?.set(overrides.emissive.value);
    if (
      target.emissive &&
      overrides.emissive.intensity !== undefined &&
      typeof target.emissiveIntensity === "number"
    ) {
      target.emissiveIntensity = overrides.emissive.intensity;
    }
  }
  if (
    overrides.metalness !== undefined &&
    typeof target.metalness === "number"
  ) {
    target.metalness = overrides.metalness;
  }
  if (
    overrides.roughness !== undefined &&
    typeof target.roughness === "number"
  ) {
    target.roughness = overrides.roughness;
  }
  for (const [slot, texture] of Object.entries(overrides.textures)) {
    assignMaterialTexture(
      material,
      slot as ScriptMaterialTextureSlot,
      texture ?? null,
    );
  }
}

/**
 * Owns per-Material-slot Texture clones used by runtime transform overrides.
 *
 * @internal Exported for the shared Studio/publish contract fixture.
 */
export class ScriptMaterialTextureClonePool {
  readonly #entries = new Map<
    string,
    {
      source: Texture;
      clone: Texture;
    }
  >();

  get size(): number {
    return this.#entries.size;
  }

  resolve(
    key: string,
    source: Texture,
    transform: ScriptMaterialTextureTransform,
  ): Texture {
    let entry = this.#entries.get(key);
    if (!entry || entry.source !== source) {
      entry?.clone.dispose();
      entry = {
        source,
        clone: source.clone(),
      };
      this.#entries.set(key, entry);
    }
    resetTextureTransformFromSource(entry.clone, source);
    applyMaterialTextureTransform(entry.clone, transform);
    return entry.clone;
  }

  releaseUnused(activeKeys: ReadonlySet<string>): void {
    for (const [key, entry] of this.#entries) {
      if (activeKeys.has(key)) continue;
      entry.clone.dispose();
      this.#entries.delete(key);
    }
  }

  dispose(): void {
    for (const entry of this.#entries.values()) {
      entry.clone.dispose();
    }
    this.#entries.clear();
  }
}

function applyMaterialTextureTransforms(
  state: MaterialState,
  materialIndex: number,
  material: Material,
  transforms: MaterialOverrides["textureTransforms"],
  activeTextureCloneKeys: Set<string>,
): void {
  for (const slot of Object.keys(
    transforms,
  ) as ScriptMaterialTextureSlot[]) {
    const transform = transforms[slot];
    if (!transform || Object.keys(transform).length === 0) continue;
    const source = readMaterialTexture(material, slot);
    if (!source) continue;
    const key = `${materialIndex}:${slot}`;
    const clone = state.textureClones.resolve(key, source, transform);
    assignMaterialTexture(material, slot, clone);
    activeTextureCloneKeys.add(key);
  }
}

function resetTextureTransformFromSource(
  clone: Texture,
  source: Texture,
): void {
  clone.offset.copy(source.offset);
  clone.repeat.copy(source.repeat);
  clone.center.copy(source.center);
  clone.rotation = source.rotation;
  clone.matrixAutoUpdate = source.matrixAutoUpdate;
}

function applyMaterialTextureTransform(
  texture: Texture,
  transform: ScriptMaterialTextureTransform,
): void {
  if (transform.offset) {
    texture.offset.set(transform.offset[0], transform.offset[1]);
  }
  if (transform.repeat) {
    texture.repeat.set(transform.repeat[0], transform.repeat[1]);
  }
  if (transform.center) {
    texture.center.set(transform.center[0], transform.center[1]);
  }
  if (transform.rotation !== undefined) {
    texture.rotation = transform.rotation;
  }
  texture.updateMatrix();
}

function hasMaterialOverrides(overrides: MaterialOverrides): boolean {
  return (
    overrides.color !== undefined ||
    overrides.opacity !== undefined ||
    overrides.emissive !== undefined ||
    overrides.metalness !== undefined ||
    overrides.roughness !== undefined ||
    Object.keys(overrides.textures).length > 0 ||
    Object.keys(overrides.textureTransforms).length > 0
  );
}

function disposeMaterialState(state: MaterialState): void {
  state.textureClones.dispose();
  for (const clone of state.clones) clone.dispose();
}

function materialTextureUsage(material: Material): string {
  const target = scriptMaterial(material);
  return [
    Boolean(target.map),
    Boolean(target.normalMap),
    Boolean(target.emissiveMap),
    Boolean(target.metalnessMap),
    Boolean(target.roughnessMap),
    Boolean(target.aoMap),
  ].join(":");
}

function materialArray(material: Material | Material[]): Material[] {
  return Array.isArray(material) ? material : [material];
}

function scriptMaterial(material: Material): RuntimeMaterial {
  return material as RuntimeMaterial;
}

function configureScriptTexture(
  texture: Texture,
  options: Required<ScriptTextureLoadOptions>,
): void {
  if (options.colorSpace === "srgb") texture.colorSpace = SRGBColorSpace;
  else if (options.colorSpace === "linear") {
    texture.colorSpace = LinearSRGBColorSpace;
  }
  texture.wrapS = scriptTextureWrap(options.wrapS);
  texture.wrapT = scriptTextureWrap(options.wrapT);
  texture.magFilter =
    options.magFilter === "nearest" ? NearestFilter : LinearFilter;
  texture.minFilter = scriptTextureMinFilter(options.minFilter);
  texture.generateMipmaps = options.generateMipmaps;
  texture.flipY = options.flipY;
  texture.needsUpdate = true;
}

function scriptTextureWrap(
  wrap: NonNullable<ScriptTextureLoadOptions["wrapS"]>,
): Texture["wrapS"] {
  if (wrap === "repeat") return RepeatWrapping;
  if (wrap === "mirrored-repeat") return MirroredRepeatWrapping;
  return ClampToEdgeWrapping;
}

function scriptTextureMinFilter(
  filter: NonNullable<ScriptTextureLoadOptions["minFilter"]>,
): Texture["minFilter"] {
  if (filter === "nearest") return NearestFilter;
  if (filter === "linear") return LinearFilter;
  if (filter === "nearest-mipmap-nearest") {
    return NearestMipmapNearestFilter;
  }
  if (filter === "linear-mipmap-nearest") {
    return LinearMipmapNearestFilter;
  }
  if (filter === "nearest-mipmap-linear") {
    return NearestMipmapLinearFilter;
  }
  return LinearMipmapLinearFilter;
}

function assignMaterialTexture(
  material: Material,
  slot: ScriptMaterialTextureSlot,
  texture: Texture | null,
): boolean {
  const target = scriptMaterial(material);
  if (slot === "baseColor" && "map" in target) {
    target.map = texture;
    return true;
  }
  if (slot === "normal" && "normalMap" in target) {
    target.normalMap = texture;
    return true;
  }
  if (slot === "emissive" && "emissiveMap" in target) {
    target.emissiveMap = texture;
    return true;
  }
  if (slot === "metallicRoughness") {
    let assigned = false;
    if ("metalnessMap" in target) {
      target.metalnessMap = texture;
      assigned = true;
    }
    if ("roughnessMap" in target) {
      target.roughnessMap = texture;
      assigned = true;
    }
    return assigned;
  }
  if (slot === "occlusion" && "aoMap" in target) {
    target.aoMap = texture;
    return true;
  }
  return false;
}

function readMaterialTexture(
  material: Material,
  slot: ScriptMaterialTextureSlot,
): Texture | null {
  const target = scriptMaterial(material);
  if (slot === "baseColor") return target.map ?? null;
  if (slot === "normal") return target.normalMap ?? null;
  if (slot === "emissive") return target.emissiveMap ?? null;
  if (slot === "metallicRoughness") {
    return target.metalnessMap ?? target.roughnessMap ?? null;
  }
  return target.aoMap ?? null;
}

function supportsMaterialTexture(
  material: Material,
  slot: ScriptMaterialTextureSlot,
): boolean {
  const target = scriptMaterial(material);
  if (slot === "metallicRoughness") {
    return "metalnessMap" in target || "roughnessMap" in target;
  }
  return {
    baseColor: "map",
    normal: "normalMap",
    emissive: "emissiveMap",
    occlusion: "aoMap",
  }[slot] in target;
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function sameMaterialAssignment(
  current: Material | Material[],
  assigned: Material | Material[],
): boolean {
  if (Array.isArray(current) && Array.isArray(assigned)) {
    return (
      current.length === assigned.length &&
      current.every((material, index) => material === assigned[index])
    );
  }
  return (
    !Array.isArray(current) &&
    !Array.isArray(assigned) &&
    current === assigned
  );
}

function forEachOwnedMesh(
  root: Object3D,
  entityId: string,
  callback: (mesh: Mesh, meshIndex: number) => void,
): void {
  let meshIndex = 0;
  const visit = (object: Object3D) => {
    if (object !== root) {
      const marker = entityMarker(object);
      if (marker && marker !== entityId) return;
    }
    if (object instanceof Mesh) {
      callback(object, meshIndex);
      meshIndex += 1;
    }
    for (const child of object.children) visit(child);
  };
  visit(root);
}

function forEachOwnedParticleBridge(
  root: Object3D,
  entityId: string,
  callback: (bridge: XriftParticleRuntimeBridge) => void,
): void {
  const visit = (object: Object3D) => {
    if (object !== root) {
      const marker = entityMarker(object);
      if (marker && marker !== entityId) return;
    }
    const candidate = (
      object.userData as Record<string, unknown>
    )[XRIFT_PARTICLE_RUNTIME_USER_DATA_KEY];
    if (isParticleRuntimeBridge(candidate)) callback(candidate);
    for (const child of object.children) visit(child);
  };
  visit(root);
}

function forEachOwnedAudioSourceBridge(
  root: Object3D,
  entityId: string,
  callback: (bridge: XriftAudioSourceRuntimeBridge) => void,
): void {
  const visit = (object: Object3D) => {
    if (object !== root) {
      const marker = entityMarker(object);
      if (marker && marker !== entityId) return;
    }
    const candidate = (
      object.userData as Record<string, unknown>
    )[XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY];
    if (isAudioSourceRuntimeBridge(candidate)) callback(candidate);
    for (const child of object.children) visit(child);
  };
  visit(root);
}

function isAudioSourceRuntimeBridge(
  value: unknown,
): value is XriftAudioSourceRuntimeBridge {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as XriftAudioSourceRuntimeBridge).setOwner === "function" &&
    typeof (value as XriftAudioSourceRuntimeBridge).removeOwner ===
      "function" &&
    typeof (value as XriftAudioSourceRuntimeBridge).command === "function" &&
    typeof (value as XriftAudioSourceRuntimeBridge).read === "function"
  );
}

function isParticleRuntimeBridge(
  value: unknown,
): value is XriftParticleRuntimeBridge {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as XriftParticleRuntimeBridge).setOwner === "function" &&
    typeof (value as XriftParticleRuntimeBridge).removeOwner === "function" &&
    typeof (value as XriftParticleRuntimeBridge).read === "function"
  );
}

function entityMarker(object: Object3D): string | undefined {
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

function findEntityObject(root: Object3D, entityId: string): Object3D | null {
  let found: Object3D | null = null;
  root.traverse((object) => {
    if (!found && entityMarker(object) === entityId) found = object;
  });
  return found;
}

function findScriptScope(object: Object3D, scene: Object3D): Object3D {
  let current: Object3D | null = object;
  let sceneChild: Object3D = object;
  while (current && current !== scene) {
    const data = current.userData as { xriftScriptScope?: unknown };
    if (data.xriftScriptScope === true) return current;
    sceneChild = current;
    current = current.parent;
  }
  return sceneChild;
}

function scriptAssetDescriptorFromUrl(
  value: string | null,
): ScriptAssetRuntimeDescriptor | null {
  return value ? { url: value } : null;
}

function resolveScriptAssetDescriptor(
  descriptor: ScriptAssetRuntimeDescriptor | null,
  assetBaseUrl?: string,
): ScriptAssetRuntimeDescriptor | null {
  if (!descriptor) return null;
  const url = resolveScriptAssetUrl(descriptor.url, assetBaseUrl);
  if (!url) return null;
  return {
    url,
    ...(descriptor.textureDefaults
      ? { textureDefaults: { ...descriptor.textureDefaults } }
      : {}),
  };
}

function resolveScriptAssetUrl(
  value: string | null,
  assetBaseUrl?: string,
): string | null {
  if (
    !value ||
    !assetBaseUrl ||
    /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)
  ) {
    return value;
  }
  return `${assetBaseUrl.replace(/\/+$/, "")}/${value.replace(/^\/+/, "")}`;
}

/** Fills unset values from the declaration so a script never reads undefined. */
export function resolveProps(
  declaration: ScriptPropsDeclaration | undefined,
  values: Record<string, unknown>,
): Record<string, unknown> {
  if (!declaration) return { ...values };
  const resolved: Record<string, unknown> = {};
  for (const [name, definition] of Object.entries(declaration)) {
    const value = values[name];
    resolved[name] = isValidPropValue(definition, value)
      ? value
      : defaultFor(definition);
  }
  return resolved;
}

function defaultFor(definition: ScriptPropDefinition): unknown {
  if (isValidPropValue(definition, definition.default)) {
    return definition.default;
  }
  const numericFallback = Math.min(
    definition.max ?? Number.POSITIVE_INFINITY,
    Math.max(definition.min ?? Number.NEGATIVE_INFINITY, 0),
  );
  switch (definition.kind) {
    case "number":
      return numericFallback;
    case "boolean":
      return false;
    case "vec2":
      return [numericFallback, numericFallback];
    case "vec3":
      return [numericFallback, numericFallback, numericFallback];
    case "color":
      return "#ffffff";
    case "enum":
      return definition.options?.[0] ?? "";
    default:
      return "";
  }
}

function isValidPropValue(
  definition: ScriptPropDefinition,
  value: unknown,
): boolean {
  const validNumber = (entry: unknown) =>
    typeof entry === "number" &&
    Number.isFinite(entry) &&
    (definition.min === undefined || entry >= definition.min) &&
    (definition.max === undefined || entry <= definition.max);
  switch (definition.kind) {
    case "string":
    case "asset":
    case "entity":
      return typeof value === "string";
    case "color":
      return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
    case "enum":
      return (
        typeof value === "string" &&
        (!definition.options || definition.options.includes(value))
      );
    case "number":
      return validNumber(value);
    case "boolean":
      return typeof value === "boolean";
    case "vec2":
    case "vec3": {
      const length = definition.kind === "vec2" ? 2 : 3;
      return (
        Array.isArray(value) &&
        value.length === length &&
        value.every(validNumber)
      );
    }
  }
}
