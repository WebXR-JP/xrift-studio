/**
 * The `xrift:script` authoring API.
 *
 * This module is the single source of truth for both the Studio's Play mode
 * and the code emitted into a published world. Do not fork it: the compiler
 * inlines this exact file into the staging project. See docs/SCRIPTING.md.
 *
 * Lifecycle names follow the `RuntimePlugin` contract in
 * docs/VISUAL_EDITOR_ARCHITECTURE.md 4.6.
 */

export type ScriptVec2 = [number, number];
export type ScriptVec3 = [number, number, number];

export type ScriptPropKind =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "vec2"
  | "vec3"
  | "color"
  | "asset"
  | "entity";

export type ScriptAssetKind =
  | "model"
  | "material"
  | "texture"
  | "audio"
  | "particle";

export type ScriptPropDefinition = {
  kind: ScriptPropKind;
  label?: string;
  description?: string;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
  /** Restricts an `asset` prop to one Asset kind. */
  assetKind?: ScriptAssetKind;
};

type PropBuilderOptions = Omit<ScriptPropDefinition, "kind">;

/**
 * Property declarations. The Inspector renders fields from these, and the
 * values are stored on the Script Component as plain JSON.
 */
export const prop = {
  string(options: PropBuilderOptions & { default?: string } = {}) {
    return { kind: "string", ...options } as const satisfies ScriptPropDefinition;
  },
  number(options: PropBuilderOptions & { default?: number } = {}) {
    return { kind: "number", ...options } as const satisfies ScriptPropDefinition;
  },
  boolean(options: PropBuilderOptions & { default?: boolean } = {}) {
    return { kind: "boolean", ...options } as const satisfies ScriptPropDefinition;
  },
  enum(
    options: PropBuilderOptions & {
      options: readonly string[];
      default?: string;
    },
  ) {
    return { kind: "enum", ...options } as const satisfies ScriptPropDefinition;
  },
  vec2(options: PropBuilderOptions & { default?: ScriptVec2 } = {}) {
    return { kind: "vec2", ...options } as const satisfies ScriptPropDefinition;
  },
  vec3(options: PropBuilderOptions & { default?: ScriptVec3 } = {}) {
    return { kind: "vec3", ...options } as const satisfies ScriptPropDefinition;
  },
  /** Stored as a `#rrggbb` string. */
  color(options: PropBuilderOptions & { default?: string } = {}) {
    return { kind: "color", ...options } as const satisfies ScriptPropDefinition;
  },
  /** Declares an Asset reference resolved through `ctx.assets`. */
  asset(options: PropBuilderOptions & { kind?: ScriptAssetKind } = {}) {
    const { kind: assetKind, ...rest } = options;
    return {
      kind: "asset",
      ...(assetKind ? { assetKind } : {}),
      ...rest,
    } as const satisfies ScriptPropDefinition;
  },
  /** Resolved through `ctx.find`. */
  entity(options: PropBuilderOptions = {}) {
    return { kind: "entity", ...options } as const satisfies ScriptPropDefinition;
  },
};

export type ScriptPropsDeclaration = Record<string, ScriptPropDefinition>;

type PropValue<Definition extends ScriptPropDefinition> =
  Definition["kind"] extends "string" | "color" | "enum" | "asset" | "entity"
    ? string
    : Definition["kind"] extends "number"
      ? number
      : Definition["kind"] extends "boolean"
        ? boolean
        : Definition["kind"] extends "vec2"
          ? ScriptVec2
          : Definition["kind"] extends "vec3"
            ? ScriptVec3
            : never;

export type ScriptProps<Declaration extends ScriptPropsDeclaration> = {
  readonly [Key in keyof Declaration]: PropValue<Declaration[Key]>;
};

export type ScriptEntityHandle = {
  id: string;
  name: string;
  enabled: boolean;
};

export type ScriptTime = {
  /** Seconds since this Play run started. */
  elapsed: number;
  /** Seconds since the previous frame, clamped to avoid post-stall jumps. */
  delta: number;
};

export type ScriptInput = {
  isKeyDown(code: string): boolean;
  /** Keys held this frame, for scripts that need to enumerate them. */
  pressedKeys(): readonly string[];
};

/**
 * Async work owned by one Script instance.
 *
 * The host aborts and clears every registered operation on hot reload, runtime
 * failure, Play Stop, or unmount.
 */
export type ScriptLifecycle = {
  readonly signal: AbortSignal;
  onDispose(callback: ScriptLifecycleCallback): () => void;
  timeout(callback: ScriptLifecycleCallback, milliseconds: number): () => void;
  interval(callback: ScriptLifecycleCallback, milliseconds: number): () => void;
  task<T>(
    run: (signal: AbortSignal) => Promise<T>,
  ): Promise<T | undefined>;
};

export type ScriptLifecycleCallback = () => void | PromiseLike<void>;

export type ScriptTextureColorSpace = "auto" | "srgb" | "linear";
export type ScriptTextureWrap = "repeat" | "clamp-to-edge" | "mirrored-repeat";
export type ScriptTextureMagFilter = "nearest" | "linear";
export type ScriptTextureMinFilter =
  | "nearest"
  | "linear"
  | "nearest-mipmap-nearest"
  | "linear-mipmap-nearest"
  | "nearest-mipmap-linear"
  | "linear-mipmap-linear";

/**
 * Texture loading options kept independent from three.js types so Script
 * declarations remain portable between Studio Play and a published world.
 */
export type ScriptTextureLoadOptions = {
  colorSpace?: ScriptTextureColorSpace;
  wrapS?: ScriptTextureWrap;
  wrapT?: ScriptTextureWrap;
  magFilter?: ScriptTextureMagFilter;
  minFilter?: ScriptTextureMinFilter;
  generateMipmaps?: boolean;
  flipY?: boolean;
};

/**
 * Runtime information for an explicitly referenced Asset.
 *
 * `textureDefaults` mirrors the Texture Asset's import settings. Script load
 * options override these values without exposing the complete editor manifest
 * to a running Script.
 */
export type ScriptAssetRuntimeDescriptor = {
  url: string;
  textureDefaults?: ScriptTextureLoadOptions;
};

export type ScriptAudioLoadOptions = {
  /** Initial volume in the inclusive 0..1 range. */
  volume?: number;
  loop?: boolean;
  /** Initial playback speed. Values at or below zero fall back to 1. */
  playbackRate?: number;
  preload?: "none" | "metadata" | "auto";
};

/** A real three.js Texture is supplied by the host through this shape. */
export type ScriptTexture = {
  readonly isTexture?: true;
  offset: { x: number; y: number; set(x: number, y: number): unknown };
  repeat: { x: number; y: number; set(x: number, y: number): unknown };
  center: { x: number; y: number; set(x: number, y: number): unknown };
  rotation: number;
  needsUpdate: boolean;
  [key: string]: unknown;
};

/**
 * Lifecycle-owned audio playback without exposing the ambient DOM element.
 *
 * Browser playback policy can reject `play()`. Await it through
 * `ctx.lifecycle.task` when the Script should own and report that failure.
 */
export type ScriptAudio = {
  play(): Promise<void>;
  pause(): void;
  /** Pauses and seeks back to the beginning. */
  stop(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  setLoop(loop: boolean): void;
  setPlaybackRate(playbackRate: number): void;
  readonly playing: boolean;
  readonly currentTime: number;
  readonly duration: number;
};

export type ScriptAudioSourceStatus =
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "stopped"
  | "disabled"
  | "missing"
  | "unavailable"
  | "autoplay-blocked";

/** Selects authored Audio Source Components on this Script's own Entity. */
export type ScriptAudioSourceSelector = {
  componentId?: string;
  audioAssetId?: string;
};

/** Live, effective state of one authored Audio Source Component. */
export type ScriptAudioSourceInfo = {
  readonly componentId: string;
  readonly audioAssetId: string;
  readonly spatial: boolean;
  readonly status: ScriptAudioSourceStatus;
  readonly playing: boolean;
  readonly currentTime: number;
  readonly duration: number;
  readonly volume: number;
  readonly loop: boolean;
};

export type ScriptAudioSourceHandle = {
  /** Number of Audio Source Components currently matched by this handle. */
  count(): number;
  /**
   * Requests playback without exposing autoplay-policy failures as rejected
   * Script promises. The result is the number of sources that actually began
   * playback.
   */
  play(): Promise<number>;
  pause(): number;
  /** Pauses and seeks every matched source back to its beginning. */
  stop(): number;
  seek(seconds: number): number;
  setVolume(volume: number): number;
  setLoop(loop: boolean): number;
  /** Removes this handle's runtime overrides and pending command state. */
  reset(): void;
};

export type ScriptAudioSources = ScriptAudioSourceHandle & {
  /**
   * Lists Audio Source Components owned by this Entity. Child Entity sources
   * are intentionally excluded.
   */
  list(): readonly ScriptAudioSourceInfo[];
  /** Creates a live AND-selector for authored Audio Source Components. */
  select(selector: ScriptAudioSourceSelector): ScriptAudioSourceHandle;
  /**
   * Removes every Audio Source override owned by this Script instance while
   * preserving overrides from other Scripts.
   */
  reset(): void;
};

export type ScriptAssets = {
  /** Returns null unless the Asset is declared by this Script Component. */
  url(assetId: string): string | null;
  /**
   * Loads a declared Texture Asset. The host caches it for this Script
   * instance and disposes it automatically on restart or Stop.
   */
  loadTexture(
    assetId: string,
    options?: ScriptTextureLoadOptions,
  ): Promise<ScriptTexture | null>;
  /**
   * Creates a declared Audio Asset player owned by this Script instance.
   * It is stopped and released automatically on restart or Stop.
   */
  loadAudio(
    assetId: string,
    options?: ScriptAudioLoadOptions,
  ): Promise<ScriptAudio | null>;
};

export type ScriptMaterialTextureSlot =
  | "baseColor"
  | "normal"
  | "emissive"
  | "metallicRoughness"
  | "occlusion";

/**
 * Runtime transform layered over a Material texture without mutating the
 * Texture Asset or a Texture returned by `ctx.assets.loadTexture`.
 */
export type ScriptMaterialTextureTransform = {
  offset?: ScriptVec2;
  repeat?: ScriptVec2;
  center?: ScriptVec2;
  rotation?: number;
};

/** One Material slot discovered under this Entity's owned Meshes. */
export type ScriptMaterialInfo = {
  /** Mesh name from Three.js. Empty when the source did not provide one. */
  readonly meshName: string;
  /** Zero-based index in the owned Mesh traversal returned by `list()`. */
  readonly meshIndex: number;
  /** Zero-based Material slot index on the Mesh. */
  readonly materialIndex: number;
  /** Material name from Three.js. Empty when the source did not provide one. */
  readonly materialName: string;
};

/**
 * Selects Material slots by their current owned-Mesh traversal metadata.
 * Supplied fields are combined with AND; duplicate names can match more than
 * one Mesh, while indexes provide an exact target for the current traversal.
 */
export type ScriptMaterialSelector = {
  meshName?: string;
  meshIndex?: number;
  materialIndex?: number;
};

export type ScriptMaterialHandle = {
  /** Number of Material slots currently matched by this handle. */
  count(): number;
  setColor(value: string | number): number;
  setOpacity(value: number): number;
  setEmissive(value: string | number, intensity?: number): number;
  setMetalness(value: number): number;
  setRoughness(value: number): number;
  setTexture(
    slot: ScriptMaterialTextureSlot,
    texture: ScriptTexture | null,
  ): number;
  /**
   * Applies the supplied transform fields over the effective texture in this
   * slot. The host uses an owned Texture clone for every matched Material.
   */
  setTextureTransform(
    slot: ScriptMaterialTextureSlot,
    transform: ScriptMaterialTextureTransform,
  ): number;
  /** Removes this handle's transform override for one texture slot. */
  resetTextureTransform(slot: ScriptMaterialTextureSlot): number;
  /** Removes this handle's overrides while preserving other Script owners. */
  reset(): void;
};

export type ScriptMaterials = ScriptMaterialHandle & {
  /** Lists Material slots owned by this Entity, excluding child Entities. */
  list(): readonly ScriptMaterialInfo[];
  /**
   * Creates a live handle for the matching Material slots. The selector is
   * resolved again when asynchronous Meshes are added or removed.
   */
  select(selector: ScriptMaterialSelector): ScriptMaterialHandle;
  /**
   * Removes every Material override owned by this Script instance while
   * preserving overrides from other Scripts.
   */
  reset(): void;
};

export type ScriptLightType =
  | "ambient"
  | "directional"
  | "hemisphere"
  | "point"
  | "spot"
  | "rectArea";

/** Selects authored Light Components on this Script's own Entity. */
export type ScriptLightSelector = {
  componentId?: string;
  lightType?: ScriptLightType;
};

/** Live, effective state of one authored Light Component. */
export type ScriptLightInfo = {
  readonly componentId: string;
  readonly lightType: ScriptLightType;
  readonly enabled: boolean;
  readonly color: string | number;
  readonly intensity: number;
  readonly distance?: number;
};

export type ScriptLightHandle = {
  count(): number;
  setEnabled(enabled: boolean): number;
  setColor(value: string | number): number;
  setIntensity(intensity: number): number;
  /** Effective only for Point and Spot lights. */
  setDistance(distance: number): number;
  /** Removes this handle's overrides while preserving other Script owners. */
  reset(): void;
};

/**
 * Runtime-only controls for authored Light Components owned by this Entity.
 *
 * Overrides are composed in Script Component order and restored on restart,
 * failure, or Play Stop. Persistent Light edits stay in Inspector/MCP tools.
 */
export type ScriptLights = ScriptLightHandle & {
  list(): readonly ScriptLightInfo[];
  select(selector: ScriptLightSelector): ScriptLightHandle;
  reset(): void;
};

/**
 * Runtime-only controls for Particle Emitter components owned by this Entity.
 *
 * Overrides are composed in Script Component order and are removed when the
 * Script restarts or Play stops. Particle Asset authoring stays in the Editor
 * and MCP asset tools.
 */
export type ScriptParticles = {
  count(): number;
  play(): number;
  pause(): number;
  /** Stops and clears the current simulation until play or restart is called. */
  stop(): number;
  restart(): number;
  setEmissionRate(particlesPerSecond: number): number;
  setSpeedMultiplier(multiplier: number): number;
  setSizeMultiplier(multiplier: number): number;
  setColor(value: string | number): number;
  setOpacity(value: number): number;
  reset(): void;
};

/**
 * What this viewer sees, for the duration of this Play session.
 *
 * Scene settings are shared by everyone in a world, which makes them the wrong
 * place to answer「重い端末のユーザーにも遊んでほしい」: raising the quality for
 * one viewer raises it for the person on a headset that cannot afford it. These
 * writes are client-local — they land on the renderer running this Script and
 * nothing else — so a world can offer「画質を上げる」and let each person choose.
 *
 * Runtime-only, like `lights` and `materials`: the Script's own overrides come
 * off on restart, on failure and on Stop, and a viewer who re-enters sees the
 * Scene settings again.
 */
export type ScriptViewer = {
  /** Post effects as a whole. */
  setPostprocessing(enabled: boolean): void;
  setBloom(options: {
    enabled?: boolean;
    strength?: number;
    radius?: number;
    threshold?: number;
  }): void;
  setAmbientOcclusion(enabled: boolean): void;
  setColorGrading(enabled: boolean): void;
  /** Absolute tone-mapping exposure. 1 is the usual authored value. */
  setExposure(value: number): void;
  setFog(options: {
    enabled?: boolean;
    color?: string | number;
    near?: number;
    far?: number;
  }): void;
  setAmbient(options: {
    enabled?: boolean;
    color?: string | number;
    intensity?: number;
  }): void;
  setSkybox(options: {
    enabled?: boolean;
    ibl?: boolean;
    exposure?: number;
    rotationDegrees?: number;
  }): void;
  /** Field of view in degrees. */
  setCameraFov(degrees: number): void;
  /** Removes this Script's viewer overrides, back to the Scene settings. */
  reset(): void;
};

/**
 * Minimal structural stand-ins so this module stays dependency-free. The host
 * passes real three.js objects; scripts import three themselves for types.
 */
export type ScriptObject3D = {
  visible: boolean;
  position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  rotateOnAxis(axis: unknown, angle: number): unknown;
  rotateX(angle: number): unknown;
  rotateY(angle: number): unknown;
  rotateZ(angle: number): unknown;
  lookAt(target: unknown): void;
  getWorldPosition(target: unknown): unknown;
  [key: string]: unknown;
};

export type ScriptContext<
  Declaration extends ScriptPropsDeclaration = ScriptPropsDeclaration,
> = {
  entity: ScriptEntityHandle;
  /** This Entity's group. Mutating it during Play does not touch the document. */
  object3d: ScriptObject3D;
  scene: unknown;
  camera: unknown;
  renderer: unknown;
  props: ScriptProps<Declaration>;
  time: ScriptTime;
  input: ScriptInput;
  lifecycle: ScriptLifecycle;
  assets: ScriptAssets;
  /**
   * Runtime-only controls for authored Audio Source Components on this Entity.
   * Overrides are restored automatically on restart, failure, or Play Stop.
   */
  audioSources: ScriptAudioSources;
  /**
   * Runtime-only Material overrides for this Entity. Changes are isolated
   * from shared Asset instances and are restored on restart or Stop.
   */
  materials: ScriptMaterials;
  /**
   * Runtime-only Light overrides for this Entity. Changes are restored
   * automatically on restart, failure, or Play Stop.
   */
  lights: ScriptLights;
  /**
   * Runtime-only Particle Emitter controls for this Entity. Overrides are
   * restored automatically on restart or Stop.
   */
  particles: ScriptParticles;
  /**
   * This viewer's own picture: post effects, exposure, fog, ambient light, the
   * sky and the field of view. Client-local and runtime-only — nothing here is
   * synchronised to other viewers or written to the Scene.
   */
  viewer: ScriptViewer;
  /** Only Entities declared through an `entity` prop are reachable. */
  find(entityId: string): ScriptObject3D | null;
  /** @deprecated Prefer `assets.url(assetId)`. */
  getAssetUrl(assetId: string): string | null;
  on(
    event: string,
    handler: (payload?: unknown) => void | PromiseLike<void>,
  ): () => void;
  emit(event: string, payload?: unknown): void;
  log(...values: unknown[]): void;
};

/**
 * Props supplied to an optional named `Render` export.
 *
 * The same live context used by `start(ctx)` is passed after the Script starts.
 * This lets declarative R3F content resolve only explicitly declared Assets
 * and observe Inspector/MCP property edits.
 */
export type ScriptRenderProps<
  Declaration extends ScriptPropsDeclaration = ScriptPropsDeclaration,
> = {
  ctx: ScriptContext<Declaration>;
};

/** Returned by `start`. Every member is optional. */
export type ScriptInstance = {
  update?(delta: number): void;
  stop?(): void;
  dispose?(): void;
};

export type ScriptDefinition<
  Declaration extends ScriptPropsDeclaration = ScriptPropsDeclaration,
> = {
  name: string;
  props?: Declaration;
  start?(context: ScriptContext<Declaration>): ScriptInstance | void;
};

export type CompiledScript<
  Declaration extends ScriptPropsDeclaration = ScriptPropsDeclaration,
> = ScriptDefinition<Declaration> & {
  readonly __xriftScript: true;
};

/**
 * Declares a script. The returned object is inert data plus the lifecycle
 * hooks; the host decides when to call them.
 */
export function defineScript<Declaration extends ScriptPropsDeclaration>(
  definition: ScriptDefinition<Declaration>,
): CompiledScript<Declaration> {
  return { ...definition, __xriftScript: true };
}

export function isCompiledScript(value: unknown): value is CompiledScript {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __xriftScript?: unknown }).__xriftScript === true
  );
}
