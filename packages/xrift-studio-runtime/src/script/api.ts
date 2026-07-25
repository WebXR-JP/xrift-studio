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

export type ScriptTextureColorSpace = "auto" | "srgb" | "linear";
export type ScriptTextureWrap = "repeat" | "clamp-to-edge" | "mirrored-repeat";

/**
 * Texture loading options kept independent from three.js types so Script
 * declarations remain portable between Studio Play and a published world.
 */
export type ScriptTextureLoadOptions = {
  colorSpace?: ScriptTextureColorSpace;
  wrapS?: ScriptTextureWrap;
  wrapT?: ScriptTextureWrap;
  flipY?: boolean;
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
};

export type ScriptMaterialTextureSlot =
  | "baseColor"
  | "normal"
  | "emissive"
  | "metallicRoughness"
  | "occlusion";

export type ScriptMaterials = {
  /** Number of Materials owned by this Entity, excluding child Entities. */
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
  /** Removes this Script instance's overrides while preserving other Scripts. */
  reset(): void;
};

/**
 * Minimal structural stand-ins so this module stays dependency-free. The host
 * passes real three.js objects; scripts import three themselves for types.
 */
export type ScriptObject3D = {
  position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
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
  assets: ScriptAssets;
  /**
   * Runtime-only Material overrides for this Entity. Changes are isolated
   * from shared Asset instances and are restored on restart or Stop.
   */
  materials: ScriptMaterials;
  /** Only Entities declared through an `entity` prop are reachable. */
  find(entityId: string): ScriptObject3D | null;
  /** @deprecated Prefer `assets.url(assetId)`. */
  getAssetUrl(assetId: string): string | null;
  on(event: string, handler: (payload?: unknown) => void): () => void;
  emit(event: string, payload?: unknown): void;
  log(...values: unknown[]): void;
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
