export const XRIFT_STUDIO_RUNTIME_FORMAT = "xrift-studio.runtime" as const;
export const XRIFT_STUDIO_RUNTIME_SCHEMA_VERSION = "1.0.0" as const;
/**
 * Bumped when the published runtime shell must be rebuilt to keep parity with
 * the loader and R3F adapters. The shell build script copies this into its
 * manifest, and the browser upload path refuses an older shell.
 */
export const XRIFT_RUNTIME_CONTRACT_VERSION =
  "2026-08-29-text-fonts-background-v1" as const;

export type XriftRuntimeDiagnostic = {
  severity: "warning" | "error";
  code: string;
  message: string;
  entityId?: string;
  componentId?: string;
  assetId?: string;
};

export type XriftRuntimeTransform = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

export type XriftRuntimeGeometry =
  | {
      kind: "primitive";
      primitive: "box" | "sphere" | "cylinder" | "cone" | "plane";
    }
  | {
      kind: "terrain";
      width: number;
      depth: number;
      resolution: number;
      heights: number[];
      /** `true` omits the corresponding heightmap cell from the mesh. */
      holes?: boolean[];
    }
  | { kind: "model"; assetId: string; sourceNodeIndex?: number };

export type XriftRuntimeMaterialBinding = {
  slot: string;
  materialAssetId: string;
  sourceNodeIndex?: number;
};

/** Unlit plate drawn behind a Text component. */
export type XriftRuntimeTextBackground = {
  mode: "none" | "color" | "texture";
  color: string;
  opacity: number;
  textureAssetId?: string;
  paddingX: number;
  paddingY: number;
  /** `text` fits the plate to the rendered block; `fixed` uses width/height. */
  fit: "text" | "fixed";
  width: number;
  height: number;
  offset: number;
  doubleSided: boolean;
};

export type XriftRuntimeComponent =
  | {
      id: string;
      type: "mesh";
      enabled: boolean;
      geometry: XriftRuntimeGeometry;
      materialBindings: XriftRuntimeMaterialBinding[];
      castShadow: boolean;
      receiveShadow: boolean;
      /** Optional local draw-distance cutoff; omitted uses scene camera.far. */
      maxDistance?: number;
      modelPose?: {
        bones: Record<string, [number, number, number]>;
        morphTargets: Record<string, number>;
        nodes?: Record<
          string,
          {
            position: [number, number, number];
            rotation: [number, number, number];
            scale: [number, number, number];
          }
        >;
      };
    }
  | {
      id: string;
      type: "light";
      enabled: boolean;
      lightType:
        | "ambient"
        | "directional"
        | "hemisphere"
        | "point"
        | "spot"
        | "rectArea";
      color: string;
      intensity: number;
      castShadow: boolean;
      groundColor?: string;
      distance?: number;
      decay?: number;
      angle?: number;
      penumbra?: number;
      width?: number;
      height?: number;
    }
  | {
      id: string;
      type: "text";
      enabled: boolean;
      text: string;
      color: string;
      fontSize: number;
      maxWidth?: number;
      anchorX: "left" | "center" | "right";
      anchorY: "top" | "middle" | "bottom";
      outlineWidth: number;
      outlineColor: string;
      /** Font catalog id. Absent keeps the automatically resolved Noto face. */
      fontId?: string;
      fontWeight?: number;
      textAlign?: "left" | "center" | "right" | "justify";
      /** Multiple of `fontSize`. Absent uses the font's own metrics. */
      lineHeight?: number;
      letterSpacing?: number;
      background?: XriftRuntimeTextBackground;
    }
  | {
      id: string;
      type: "collider";
      enabled: boolean;
      shape: "box" | "mesh";
      [key: string]: unknown;
    }
  | {
      id: string;
      type: "rigid-body";
      enabled: boolean;
      bodyType:
        | "fixed"
        | "dynamic"
        | "kinematicPosition"
        | "kinematicVelocity";
      autoColliders: "none" | "ball" | "cuboid" | "hull" | "trimesh";
      isTrigger: boolean;
      friction: number;
      restitution: number;
      gravityScale: number;
      linearDamping: number;
      angularDamping: number;
      canSleep: boolean;
      ccd: boolean;
      lockTranslations: boolean;
      lockRotations: boolean;
    }
  | {
      id: string;
      type: "vegetation-wind";
      enabled: boolean;
      windStrength: number;
      windSpeed: number;
      gustStrength: number;
    }
  | {
      id: string;
      type: "audio-source";
      enabled: boolean;
      audioAssetId?: string;
      volume: number;
      loop: boolean;
      autoplay: boolean;
      spatial: boolean;
      refDistance: number;
      rolloffFactor: number;
      maxDistance: number;
    }
  | {
      id: string;
      type: "particle-emitter";
      enabled: boolean;
      particleAssetId: string;
    }
  | {
      id: string;
      type: "spawn-point";
      enabled: boolean;
      target: "player" | "item-preview";
    }
  | {
      id: string;
      type: "xrift-component";
      enabled: boolean;
      schemaId: string;
      schemaVersion: string;
      properties: Record<string, unknown>;
      assetReferences: string[];
      entityReferences: string[];
    };

export type XriftRuntimeEntity = {
  id: string;
  name: string;
  parentId: string | null;
  children: string[];
  enabled: boolean;
  transform: XriftRuntimeTransform;
  components: XriftRuntimeComponent[];
};

export type XriftRuntimeScene = {
  id: string;
  name: string;
  rootEntityIds: string[];
  entities: Record<string, XriftRuntimeEntity>;
  settings?: Record<string, unknown>;
};

export type XriftRuntimeAsset =
  | {
      id: string;
      kind: "model";
      name: string;
      url: string;
      sourceFormat?: "glb" | "gltf" | "obj" | "vrm";
      scale: number;
      openBrush?: {
        renderer: "three-icosa";
        rendererVersion: string;
        extensionNames: string[];
        brushBaseUrl: string;
      };
      materialSlots: Array<{
        slot: string;
        name: string;
        sourceMaterialIndex?: number;
      }>;
    }
  | {
      id: string;
      kind: "texture";
      name: string;
      url: string;
      sourceFormat?: "image" | "ktx2";
      colorSpace: "auto" | "srgb" | "linear";
      flipY: boolean;
      sampler: {
        wrapS: "repeat" | "clamp-to-edge" | "mirrored-repeat";
        wrapT: "repeat" | "clamp-to-edge" | "mirrored-repeat";
      };
    }
  | {
      id: string;
      kind: "skybox";
      name: string;
      url: string;
      sourceFormat: "hdr" | "exr" | "image";
      projection: "equirectangular";
      flipY: boolean;
    }
  | {
      id: string;
      kind: "audio";
      name: string;
      url: string;
    }
  | {
      id: string;
      kind: "material";
      name: string;
      properties: Record<string, unknown>;
      shader?:
        | {
            kind: "openbrush";
            renderer: "three-icosa";
            rendererVersion: string;
            brushName: string;
            brushGuid?: string;
            brushBaseUrl: string;
            sourceMaterialIndex: number;
            sourceOverrides?: {
              vertexShader?: string;
              fragmentShader?: string;
            };
            attributeBindings?: Record<
              string,
              { sourceAttribute?: string; defaultValue?: number[] }
            >;
          }
        | {
            kind: "classic-r3f";
            sourceModulePath: string;
            vertexShader: string;
            fragmentShader: string;
            uniforms: Record<
              string,
              | { kind: "texture"; textureAssetId: string; colorSpace?: "srgb" | "linear"; generateMipmaps?: boolean; filter?: "nearest" | "linear"; wrapS?: "repeat" | "clamp-to-edge"; wrapT?: "repeat" | "clamp-to-edge" }
              | { kind: "number"; value: number }
              | { kind: "color"; value: string }
              | { kind: "vector"; value: number[] }
            >;
            variants: Array<{
              name: string;
              meshNameIncludes?: string;
              defines: Record<string, string>;
              side: "front" | "back" | "double";
              transparent: boolean;
              depthWrite: boolean;
            }>;
            animatedTimeUniform?: string;
            sourceModelAssetId?: string;
            vertexShaderAssetId?: string;
            fragmentShaderAssetId?: string;
          };
    }
  | {
      id: string;
      kind: "particle";
      name: string;
      properties: Record<string, unknown>;
    }
  | {
      id: string;
      kind: "interactivity";
      name: string;
      extensionName: "KHR_interactivity";
      specStatus: "release-candidate-2026-07-16";
      extension: Record<string, unknown>;
    };

export type XriftRuntimeManifest = {
  format: typeof XRIFT_STUDIO_RUNTIME_FORMAT;
  schemaVersion: typeof XRIFT_STUDIO_RUNTIME_SCHEMA_VERSION;
  generator: "xrift-studio";
  compilerVersion: string;
  projectId: string;
  projectKind: "world" | "item";
  entryScene: string;
  scenes: Record<string, XriftRuntimeScene>;
  assets: Record<string, XriftRuntimeAsset>;
  /**
   * Decoder directories the world ships itself, relative to this manifest.
   *
   * KTX2 and Draco cannot be read without a transcoder / decoder. A published
   * world has no permission to reach a CDN, so the compiler copies the files
   * next to the world and names them here. Absent on manifests compiled before
   * the files were shipped; the loader then falls back to its public defaults.
   */
  decoders?: XriftRuntimeDecoderPaths;
  /**
   * Base the world serves its bundled Text fonts from, relative to this
   * manifest.
   *
   * The font file itself is copied next to the world for the same reason a
   * decoder is: a published world cannot reach a CDN. Without this the loader
   * falls back to the host's own base URL, which points at the site root
   * instead of the world directory, so the copied file is never found and
   * troika drops to its per-script fallback CDN.
   */
  textFontBaseUrl?: string;
};

export type XriftRuntimeDecoderPaths = {
  ktx2TranscoderPath?: string;
  dracoDecoderPath?: string;
};

const RUNTIME_TERRAIN_SIZE_MIN = 0.5;
const RUNTIME_TERRAIN_SIZE_MAX = 512;
const RUNTIME_TERRAIN_RESOLUTION_MIN = 9;
const RUNTIME_TERRAIN_RESOLUTION_MAX = 257;
const RUNTIME_TERRAIN_HEIGHT_ABSOLUTE_MAX = 256;

/**
 * Validates the runtime boundary before Three.js allocates geometry or reads
 * component fields. In particular, Terrain sample arrays are untrusted when a
 * manifest is loaded from a URL and must not be allowed to request arbitrary
 * buffer sizes.
 */
export function isXriftRuntimeManifest(value: unknown): value is XriftRuntimeManifest {
  if (!isRecord(value)) return false;
  const scenes = value.scenes;
  const assets = value.assets;
  const entryScene = value.entryScene;
  return (
    value.format === XRIFT_STUDIO_RUNTIME_FORMAT &&
    value.schemaVersion === XRIFT_STUDIO_RUNTIME_SCHEMA_VERSION &&
    value.generator === "xrift-studio" &&
    typeof value.compilerVersion === "string" &&
    typeof value.projectId === "string" &&
    (value.projectKind === "world" || value.projectKind === "item") &&
    typeof entryScene === "string" &&
    isRecord(scenes) &&
    isRecord(assets) &&
    Object.values(scenes).every(isRuntimeScene) &&
    Object.values(assets).every(isRuntimeAsset) &&
    isRuntimeDecoderPaths(value.decoders) &&
    (value.textFontBaseUrl === undefined ||
      typeof value.textFontBaseUrl === "string") &&
    isRuntimeScene(scenes[entryScene])
  );
}

function isRuntimeDecoderPaths(
  value: unknown,
): value is XriftRuntimeDecoderPaths | undefined {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return (
    (value.ktx2TranscoderPath === undefined ||
      typeof value.ktx2TranscoderPath === "string") &&
    (value.dracoDecoderPath === undefined ||
      typeof value.dracoDecoderPath === "string")
  );
}

function isRuntimeScene(value: unknown): value is XriftRuntimeScene {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isStringArray(value.rootEntityIds) &&
    isRecord(value.entities) &&
    Object.values(value.entities).every(isRuntimeEntity) &&
    (value.settings === undefined || isRecord(value.settings))
  );
}

function isRuntimeEntity(value: unknown): value is XriftRuntimeEntity {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.parentId === null || typeof value.parentId === "string") &&
    isStringArray(value.children) &&
    typeof value.enabled === "boolean" &&
    isRuntimeTransform(value.transform) &&
    Array.isArray(value.components) &&
    value.components.every(isRuntimeComponent)
  );
}

function isRuntimeTransform(value: unknown): value is XriftRuntimeTransform {
  return (
    isRecord(value) &&
    isFiniteTuple(value.position, 3) &&
    isFiniteTuple(value.rotation, 3) &&
    isFiniteTuple(value.scale, 3)
  );
}

function isRuntimeComponent(value: unknown): value is XriftRuntimeComponent {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.type !== "string" ||
    typeof value.enabled !== "boolean"
  ) {
    return false;
  }
  if (value.type !== "mesh") return true;
  return (
    isRuntimeGeometry(value.geometry) &&
    Array.isArray(value.materialBindings) &&
    value.materialBindings.every(isRuntimeMaterialBinding) &&
    typeof value.castShadow === "boolean" &&
    typeof value.receiveShadow === "boolean"
  );
}

function isRuntimeGeometry(value: unknown): value is XriftRuntimeGeometry {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "primitive") {
    return ["box", "sphere", "cylinder", "cone", "plane"].includes(
      value.primitive as string,
    );
  }
  if (value.kind === "model") return typeof value.assetId === "string";
  if (value.kind !== "terrain") return false;
  return (
    isRuntimeTerrainSize(value.width) &&
    isRuntimeTerrainSize(value.depth) &&
    isRuntimeTerrainResolution(value.resolution) &&
    Array.isArray(value.heights) &&
    value.heights.length === value.resolution * value.resolution &&
    value.heights.every(isRuntimeTerrainHeight) &&
    (value.holes === undefined ||
      (Array.isArray(value.holes) &&
        value.holes.length === (value.resolution - 1) * (value.resolution - 1) &&
        value.holes.every((hole) => typeof hole === "boolean")))
  );
}

function isRuntimeMaterialBinding(
  value: unknown,
): value is XriftRuntimeMaterialBinding {
  return (
    isRecord(value) &&
    typeof value.slot === "string" &&
    typeof value.materialAssetId === "string" &&
    (value.sourceNodeIndex === undefined || Number.isInteger(value.sourceNodeIndex))
  );
}

function isRuntimeAsset(value: unknown): value is XriftRuntimeAsset {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.kind !== "string"
  ) {
    return false;
  }
  switch (value.kind) {
    case "model":
      return typeof value.url === "string" && Number.isFinite(value.scale);
    case "texture":
    case "skybox":
    case "audio":
      return typeof value.url === "string";
    case "material":
    case "particle":
      return isRecord(value.properties);
    case "interactivity":
      return isRecord(value.extension);
    default:
      return false;
  }
}

function isRuntimeTerrainSize(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= RUNTIME_TERRAIN_SIZE_MIN &&
    value <= RUNTIME_TERRAIN_SIZE_MAX
  );
}

function isRuntimeTerrainResolution(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= RUNTIME_TERRAIN_RESOLUTION_MIN &&
    value <= RUNTIME_TERRAIN_RESOLUTION_MAX
  );
}

function isRuntimeTerrainHeight(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= RUNTIME_TERRAIN_HEIGHT_ABSOLUTE_MAX
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isFiniteTuple(value: unknown, length: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
