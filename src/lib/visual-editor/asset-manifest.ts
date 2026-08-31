export const ASSET_MANIFEST_SCHEMA_VERSION = "0.1.0" as const;

import type {
  KhrInteractivityExtension,
  KHR_INTERACTIVITY_EXTENSION_NAME,
  KHR_INTERACTIVITY_SPEC_STATUS,
} from "./interactivity-graph";
import type { MaterialShader } from "./custom-shader-contract";
import {
  MATERIAL_EXTENSION_DESCRIPTORS,
  MATERIAL_EXTENSION_NAMES,
  type MaterialExtensionFieldDescriptor,
  type MaterialExtensionName,
} from "./material-extension-registry";
import {
  extensionOfPath,
  textureSourceFormatForExtension,
} from "./asset-format-registry";

export type AssetStatus = "ready" | "missing" | "invalid";

export type AssetSource =
  | {
      kind: "builtin";
      key: string;
    }
  | {
      /** Data authored directly in the asset manifest, with no backing file. */
      kind: "document";
    }
  | {
      kind: "project";
      /** Project-relative path. Absolute paths and runtime URLs are not valid IR. */
      relativePath: string;
    };

export type AssetThumbnailDescriptor =
  | { status: "missing" }
  | {
      status: "generated" | "stale";
      /** Project-relative path to a derived thumbnail, never a source/blob URL. */
      derivedPath: string;
      sourceHash: string;
      rendererVersion: string;
    };

/** Provider-neutral credit retained when an Asset is installed from a store. */
export type AssetAttribution = {
  providerId: string;
  providerName: string;
  externalId: string;
  assetUrl: string;
  licenseName: string;
  licenseUrl: string;
  authors: string[];
};

export type AssetBase<Kind extends string> = {
  id: string;
  name: string;
  kind: Kind;
  status: AssetStatus;
  source: AssetSource;
  /** SHA-256 of the imported source bytes. Builtins/documents may omit it. */
  sourceHash?: string;
  thumbnail?: AssetThumbnailDescriptor;
  /** null/undefined means the Asset root. */
  folderId?: string | null;
  /** Stable sibling order; gaps are intentionally allowed. */
  order?: number;
  attribution?: AssetAttribution;
};

export type PrimitiveGeometry =
  | "box"
  | "sphere"
  | "cylinder"
  | "cone"
  | "plane";

/** Stable authoring slot. `sourceMaterialIndex` preserves the glTF slot order. */
export type MaterialSlotDefinition = {
  slot: string;
  name: string;
  sourceMaterialIndex?: number;
  defaultMaterialAssetId?: string;
};

export type PrimitiveAsset = AssetBase<"primitive"> & {
  primitive: PrimitiveGeometry;
  /** @deprecated Read `materialSlots` when authoring new documents. */
  defaultMaterialAssetId: string;
  materialSlots: MaterialSlotDefinition[];
};

export type ModelImportSettings = {
  scale: number;
  generateColliders: boolean;
  optimizeMeshes: boolean;
  importAnimations: boolean;
};

export type ModelImportSettingsPatch = Partial<ModelImportSettings>;

export const DEFAULT_MODEL_IMPORT_SETTINGS: Readonly<ModelImportSettings> = {
  scale: 1,
  generateColliders: true,
  optimizeMeshes: false,
  importAnimations: true,
};

export type ModelBoundsMetadata = {
  /** Model-local bounds before the Asset import scale or Entity Transform. */
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  size: [number, number, number];
  boundingSphereRadius: number;
};

export type ModelAnimationMetadata = {
  name: string;
  duration: number;
  trackCount: number;
  /** Stable source order used when names are duplicated or renamed. */
  sourceAnimationIndex?: number;
};

export type ModelBoneMetadata = {
  /** Stable authored key. Bone names are unique inside newly imported Models. */
  key: string;
  name: string;
  /** Standard VRM humanoid name when the source declares one. */
  humanoidName?: string;
};

export type ModelMorphTargetMetadata = {
  /** Shape-key name applied to every source mesh that exposes this target. */
  key: string;
  name: string;
};

/** One authored glTF node retained for non-destructive Hierarchy expansion. */
export type ModelNodeMetadata = {
  sourceNodeIndex: number;
  name: string;
  parentSourceNodeIndex?: number;
  childSourceNodeIndices: number[];
  meshIndex?: number;
  /** glTF skin used by this node when it owns a skinned mesh. */
  skinIndex?: number;
  /** True when this node is referenced by a glTF skin as a joint. */
  isBone?: boolean;
  sourceMaterialIndices: number[];
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

/** Derived import facts. These are safe to rebuild from the Model source. */
export type ModelImportMetadata = {
  sourceFormat: "glb" | "gltf" | "obj" | "vrm";
  /** Original leaf name used to match a same-folder import as an update. */
  sourceFileName?: string;
  byteLength: number;
  nodeCount: number;
  meshCount: number;
  primitiveCount: number;
  bounds: ModelBoundsMetadata;
  animations: ModelAnimationMetadata[];
  /** Optional for documents imported before static pose authoring was added. */
  bones?: ModelBoneMetadata[];
  /** Optional for documents imported before static pose authoring was added. */
  morphTargets?: ModelMorphTargetMetadata[];
  /** Optional for documents imported before glTF Hierarchy expansion was added. */
  nodes?: ModelNodeMetadata[];
  /** Present only for a successfully parsed VRM source. */
  vrmVersion?: "0" | "1";
  extensionsUsed: string[];
  extensionsRequired: string[];
  /** Present when the source uses Open Brush / Tilt Brush brush materials. */
  openBrush?: import("./open-brush").OpenBrushModelMetadata;
};

/** Texture と同じ非破壊の控え。Model の Mesh 最適化 / Draco 圧縮で使う。 */
export type ModelOptimizationOrigin = {
  source: AssetSource;
  sourceHash?: string;
  importMetadata?: ModelImportMetadata;
  importSettings: ModelImportSettings;
  appliedAt: string;
};

export type ModelAsset = AssetBase<"model"> & {
  importSettings: ModelImportSettings;
  /** Slots discovered from glTF primitives/material indices during import. */
  materialSlots: MaterialSlotDefinition[];
  importMetadata?: ModelImportMetadata;
  /** 最適化結果を使っている間だけ存在する。原本へ戻すための控え。 */
  optimizedFrom?: ModelOptimizationOrigin;
};

export type ModelAssetPatch = {
  importSettings?: ModelImportSettingsPatch;
  /**
   * Applies authoring Material defaults by stable slot ID. `null` removes a
   * binding; unknown slots and non-Material Asset IDs are ignored.
   */
  materialSlotBindings?: Readonly<
    Record<string, string | null | undefined>
  >;
};

export type GeometryAsset = PrimitiveAsset | ModelAsset;

export type Color3 = [number, number, number];
export type Color4 = [number, number, number, number];

/**
 * UV transform using the same semantics as glTF `KHR_texture_transform`.
 * Omission means the glTF defaults: offset [0, 0], rotation 0, scale [1, 1].
 */
export type MaterialTextureTransform = {
  offset: [number, number];
  /** Counter-clockwise rotation in radians around the UV origin. */
  rotation: number;
  scale: [number, number];
};

export type MaterialTextureInfo = {
  textureAssetId: string;
  /** glTF TEXCOORD_n set. */
  texCoord: number;
  /** Omitted until authored, so default slots do not inflate the manifest. */
  transform?: MaterialTextureTransform;
};

export type NormalTextureInfo = MaterialTextureInfo & {
  scale: number;
};

export type OcclusionTextureInfo = MaterialTextureInfo & {
  strength: number;
};

export type MaterialAlphaMode = "OPAQUE" | "MASK" | "BLEND";

/**
 * How a fragment combines with what is already in the frame.
 *
 * glTF has no concept of this — it only describes opacity — but a VR world
 * leans on it constantly: a hologram, a light shaft or a screen glow reads as
 * light only when it adds to the frame rather than covering it.
 */
export type MaterialBlendMode =
  | "normal"
  | "additive"
  | "multiply"
  | "subtractive";

/**
 * Depth write override.
 *
 * `auto` follows the alpha mode, which is right almost always and wrong exactly
 * when an author is fixing sorting by hand — two transparent surfaces that must
 * not erase each other, or a cutout that should occlude properly.
 */
export type MaterialDepthWrite = "auto" | "on" | "off";

export type KhrMaterialsIridescence = {
  iridescenceFactor: number;
  iridescenceTexture?: MaterialTextureInfo;
  iridescenceIor: number;
  /** Both values are non-negative; glTF also permits a descending range. */
  iridescenceThicknessMinimum: number;
  iridescenceThicknessMaximum: number;
  iridescenceThicknessTexture?: MaterialTextureInfo;
};

export type KhrMaterialsClearcoat = {
  clearcoatFactor: number;
  clearcoatTexture?: MaterialTextureInfo;
  clearcoatRoughnessFactor: number;
  clearcoatRoughnessTexture?: MaterialTextureInfo;
  clearcoatNormalTexture?: NormalTextureInfo;
};

export type KhrMaterialsTransmission = {
  transmissionFactor: number;
  transmissionTexture?: MaterialTextureInfo;
};

export type KhrMaterialsIor = {
  /** glTF permits 0 as a legacy dielectric mode, otherwise this is at least 1. */
  ior: number;
};

export type KhrMaterialsEmissiveStrength = {
  emissiveStrength: number;
};

/** `KHR_materials_unlit` has no properties by specification. */
export type KhrMaterialsUnlit = Record<string, never>;

export type KhrMaterialsVolume = {
  thicknessFactor: number;
  thicknessTexture?: MaterialTextureInfo;
  /** Omitted means infinite attenuation distance in glTF. */
  attenuationDistance?: number;
  attenuationColor: Color3;
};

export type KhrMaterialsSheen = {
  sheenColorFactor: Color3;
  sheenColorTexture?: MaterialTextureInfo;
  sheenRoughnessFactor: number;
  sheenRoughnessTexture?: MaterialTextureInfo;
};

export type KhrMaterialsSpecular = {
  specularFactor: number;
  specularTexture?: MaterialTextureInfo;
  /** The glTF extension deliberately allows HDR values above 1. */
  specularColorFactor: Color3;
  specularColorTexture?: MaterialTextureInfo;
};

export type KhrMaterialsAnisotropy = {
  anisotropyStrength: number;
  /** Counter-clockwise rotation in radians. */
  anisotropyRotation: number;
  anisotropyTexture?: MaterialTextureInfo;
};

export type KhrMaterialsDispersion = {
  dispersion: number;
};

/** Declaration-merge boundary for future typed KHR_materials_* support. */
export interface MaterialExtensionSchemaRegistry {
  KHR_materials_anisotropy: KhrMaterialsAnisotropy;
  KHR_materials_clearcoat: KhrMaterialsClearcoat;
  KHR_materials_dispersion: KhrMaterialsDispersion;
  KHR_materials_emissive_strength: KhrMaterialsEmissiveStrength;
  KHR_materials_ior: KhrMaterialsIor;
  KHR_materials_iridescence: KhrMaterialsIridescence;
  KHR_materials_sheen: KhrMaterialsSheen;
  KHR_materials_specular: KhrMaterialsSpecular;
  KHR_materials_transmission: KhrMaterialsTransmission;
  KHR_materials_unlit: KhrMaterialsUnlit;
  KHR_materials_volume: KhrMaterialsVolume;
}

export type MaterialExtensions = Partial<{
  [Name in keyof MaterialExtensionSchemaRegistry]: MaterialExtensionSchemaRegistry[Name];
}>;

/** glTF 2.0 core `pbrMetallicRoughness` authoring values. */
export type PbrMetallicRoughnessProperties = {
  baseColorFactor: Color4;
  baseColorTexture?: MaterialTextureInfo;
  metallicFactor: number;
  roughnessFactor: number;
  metallicRoughnessTexture?: MaterialTextureInfo;
};

/**
 * Canonical glTF 2.0 core material plus migration aliases used by the first
 * prototype. Exporters must read the canonical fields. Helpers in this module
 * keep the aliases synchronized for older Inspector code.
 */
export type MaterialProperties = {
  pbrMetallicRoughness: PbrMetallicRoughnessProperties;
  normalTexture?: NormalTextureInfo;
  occlusionTexture?: OcclusionTextureInfo;
  emissiveFactor: Color3;
  emissiveTexture?: MaterialTextureInfo;
  alphaMode: MaterialAlphaMode;
  alphaCutoff: number;
  doubleSided: boolean;
  blending: MaterialBlendMode;
  depthWrite: MaterialDepthWrite;
  /**
   * Resolve cutout edges through MSAA instead of a hard threshold. Softer than
   * MASK on foliage and fences, and unlike BLEND it needs no sorting.
   */
  alphaToCoverage: boolean;
  extensions: MaterialExtensions;

  /** @deprecated Use `pbrMetallicRoughness.baseColorFactor`. */
  color: string;
  /** @deprecated Use `pbrMetallicRoughness.baseColorFactor[3]`. */
  opacity: number;
  /** @deprecated Use `pbrMetallicRoughness.metallicFactor`. */
  metalness: number;
  /** @deprecated Use `pbrMetallicRoughness.roughnessFactor`. */
  roughness: number;
  /** @deprecated Use the corresponding canonical TextureInfo. */
  baseColorTextureId?: string;
  /** @deprecated Use the corresponding canonical TextureInfo. */
  normalTextureId?: string;
  /** @deprecated Use the corresponding canonical TextureInfo. */
  occlusionTextureId?: string;
  /** @deprecated Use the corresponding canonical TextureInfo. */
  metallicRoughnessTextureId?: string;
  /** @deprecated Use the corresponding canonical TextureInfo. */
  emissiveTextureId?: string;
};

export type MaterialAsset = AssetBase<"material"> & {
  properties: MaterialProperties;
  /** Custom renderer preset retained without flattening it into glTF PBR. */
  shader?: import("./custom-shader-contract").MaterialShader;
  /** Present only for a Material expanded from an imported glTF/GLB. */
  importedFromModel?: ImportedMaterialProvenance;
};

export type ImportedMaterialProvenance = {
  modelAssetId: string;
  sourceMaterialIndex: number;
  sourceMaterialName: string;
  sourceSlotId: string;
  sourceHash: string;
  /** Inspector edits protect the Material from later automatic reimport updates. */
  isUserOverridden: boolean;
};

export const TEXTURE_COLOR_SPACES = ["auto", "srgb", "linear"] as const;
export type TextureColorSpace = (typeof TEXTURE_COLOR_SPACES)[number];

export const TEXTURE_WRAP_MODES = [
  "repeat",
  "clamp-to-edge",
  "mirrored-repeat",
] as const;
export type TextureWrapMode = (typeof TEXTURE_WRAP_MODES)[number];

export const TEXTURE_MAG_FILTERS = ["nearest", "linear"] as const;
export type TextureMagFilter = (typeof TEXTURE_MAG_FILTERS)[number];

export const TEXTURE_MIN_FILTERS = [
  "nearest",
  "linear",
  "nearest-mipmap-nearest",
  "linear-mipmap-nearest",
  "nearest-mipmap-linear",
  "linear-mipmap-linear",
] as const;
export type TextureMinFilter = (typeof TEXTURE_MIN_FILTERS)[number];

export const TEXTURE_COMPRESSION_FORMATS = ["source", "webp", "ktx2"] as const;
export type TextureCompressionFormat =
  (typeof TEXTURE_COMPRESSION_FORMATS)[number];

/**
 * `powerOfTwo` は最大解像度とは独立した丸め。GPU圧縮とmipmap、repeat wrapは
 * 2のべき乗の辺で素直に働くため、原寸のままでも辺だけ揃えたい場面がある。
 * 旧documentには無いので optional にし、normalizerが必ず埋める。
 */
export type TextureResizeSettings =
  | { mode: "original"; powerOfTwo?: boolean }
  | { mode: "max-size"; maxSize: number; powerOfTwo?: boolean };

export type TextureSamplerSettings = {
  wrapS: TextureWrapMode;
  wrapT: TextureWrapMode;
  magFilter: TextureMagFilter;
  minFilter: TextureMinFilter;
};

export type TextureCompressionSettings = {
  format: TextureCompressionFormat;
  /** Encoder quality in the editor's common 0..100 authoring scale. */
  quality: number;
};

export type TextureImportSettings = {
  colorSpace: TextureColorSpace;
  generateMipmaps: boolean;
  flipY: boolean;
  resize: TextureResizeSettings;
  sampler: TextureSamplerSettings;
  compression: TextureCompressionSettings;
};

export type TextureSourceFormat =
  | "png"
  | "jpeg"
  | "webp"
  | "avif"
  | "gif"
  | "bmp"
  | "svg"
  | "ktx2"
  | "hdr"
  | "exr";

export type TextureImportMetadata = {
  sourceFormat: TextureSourceFormat;
  mimeType: string;
  byteLength: number;
  width?: number;
  height?: number;
};

/**
 * 変換前の原本を丸ごと控えておく記録。
 *
 * 解像度変更・圧縮は原本ファイルを書き換えず、変換結果を別ファイルとして書き、
 * `source` の指す先だけを差し替える。ここに変換前の `source` と解析結果、
 * 変換に使ったImport設定を残すので、いつでも原本へ戻して設定を組み直せる。
 * 二度目以降の変換でもこの記録は上書きせず、最初の原本を指したままにする。
 */
export type TextureOptimizationOrigin = {
  source: AssetSource;
  sourceHash?: string;
  importMetadata?: TextureImportMetadata;
  /** 変換を実行した時のImport設定。戻した時にそのまま復元する。 */
  importSettings: TextureImportSettings;
  /** ISO 8601。最後に変換した時刻。 */
  appliedAt: string;
};

export type TextureAsset = AssetBase<"texture"> & {
  importSettings: TextureImportSettings;
  importMetadata?: TextureImportMetadata;
  /** 変換結果を使っている間だけ存在する。原本へ戻すための控え。 */
  optimizedFrom?: TextureOptimizationOrigin;
  /** Environment textures are equirectangular images used by Scene Skybox. */
  usage?: "surface" | "environment";
  projection?: "equirectangular";
  /** Present only for an image expanded from an imported glTF/GLB. */
  importedFromModel?: ImportedTextureProvenance;
};

export type EnvironmentTextureAsset = TextureAsset &
  (
    | { usage: "environment" }
    | {
        importMetadata: TextureImportMetadata & {
          sourceFormat: "hdr" | "exr";
        };
      }
  );

export type ImportedTextureProvenance = {
  modelAssetId: string;
  sourceImageIndex: number;
  sourceTextureIndex: number;
  sourceHash: string;
  /** Inspector recipe edits are retained when the embedded image is refreshed. */
  isUserOverridden: boolean;
};

export type ParticleScalarRange = {
  min: number;
  max: number;
};

export type ParticleBurst = {
  time: number;
  count: number;
  cycles: number;
  interval: number;
};

export type ParticleProperties = {
  maxParticles: number;
  duration: number;
  looping: boolean;
  prewarm: boolean;
  simulationSpace: "local" | "world";
  startDelay: ParticleScalarRange;
  startLifetime: ParticleScalarRange;
  startSpeed: ParticleScalarRange;
  startSize: ParticleScalarRange;
  startRotation: ParticleScalarRange;
  gravity: Vec3Like;
  emission: {
    rateOverTime: number;
    bursts: ParticleBurst[];
  };
  shape:
    | { type: "point" }
    | { type: "sphere"; radius: number }
    | { type: "cone"; radius: number; angle: number }
    | { type: "box"; size: Vec3Like };
  colorOverLifetime: {
    start: Color4;
    end: Color4;
  };
  sizeOverLifetime: ParticleScalarRange;
  velocityOverLifetime: {
    linear: Vec3Like;
    orbital: Vec3Like;
  };
  renderer: {
    mode: "billboard" | "stretched-billboard";
    blending: "normal" | "additive";
    sortMode: "none" | "distance" | "youngest" | "oldest";
    materialAssetId?: string;
    textureAssetId?: string;
    castShadow: boolean;
    receiveShadow: boolean;
  };
};

export type Vec3Like = [number, number, number];

export type ParticleAsset = AssetBase<"particle"> & {
  properties: ParticleProperties;
};

/** Reusable canonical glTF KHR_interactivity behavior graph. */
export type InteractivityAsset = AssetBase<"interactivity"> & {
  extensionName: typeof KHR_INTERACTIVITY_EXTENSION_NAME;
  specStatus: typeof KHR_INTERACTIVITY_SPEC_STATUS;
  extension: KhrInteractivityExtension;
};

/**
 * Legacy authoring shape. AssetManifest parsing migrates it to a TextureAsset
 * with `usage: "environment"`; new imports must not create this kind.
 */
export type SkyboxAsset = AssetBase<"skybox"> & {
  projection: "equirectangular";
  sourceFormat: "hdr" | "exr" | "image";
  byteLength?: number;
};

/** Every container a WebGL/WebXR runtime can decode through HTMLAudioElement. */
export type AudioSourceFormat = "mp3" | "wav" | "ogg" | "flac" | "m4a" | "webm";

export type AudioMimeType =
  | "audio/mpeg"
  | "audio/wav"
  | "audio/ogg"
  | "audio/flac"
  | "audio/mp4"
  | "audio/webm";

/** The one mime type each format is stored as; alternates normalise to these. */
export const AUDIO_MIME_BY_FORMAT = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  webm: "audio/webm",
} as const satisfies Record<AudioSourceFormat, AudioMimeType>;

export type AudioImportMetadata = {
  sourceFormat: AudioSourceFormat;
  mimeType: AudioMimeType;
  byteLength: number;
};

/** Imported project audio. Runtime files are copied only during compilation. */
export type AudioAsset = AssetBase<"audio"> & {
  importMetadata: AudioImportMetadata;
};

/** Font container troika can parse. WOFF2 is rejected at import. */
export type FontSourceFormat = "ttf" | "otf" | "woff";

export type FontMimeType = "font/ttf" | "font/otf" | "font/woff";

/** The one mime type each format is stored as; alternates normalise to these. */
export const FONT_MIME_BY_FORMAT = {
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
} as const satisfies Record<FontSourceFormat, FontMimeType>;

export type FontImportMetadata = {
  sourceFormat: FontSourceFormat;
  mimeType: FontMimeType;
  byteLength: number;
  /**
   * Family name read from the file's `name` table, when it could be read.
   *
   * Only a label: the file itself is what a Text renders with, so a font whose
   * name table cannot be parsed is still usable.
   */
  familyName?: string;
};

/**
 * A font file the author imported, rendered by Text through its own file.
 *
 * Studio ships one catalog family; a project font covers everything else. It is
 * copied into the published world like any other project Asset, so the world
 * still reads its lettering from its own files rather than a CDN.
 */
export type FontAsset = AssetBase<"font"> & {
  importMetadata: FontImportMetadata;
};

export type TemplateAsset = AssetBase<"template"> & {
  /** Project-relative scene-fragment document referenced by this template. */
  templatePath: string;
  templateType?: "scene-fragment" | "prefab";
};

export type PrefabAsset = AssetBase<"template"> & {
  templateType: "prefab";
  templatePath: string;
  /** Project-relative path to a versioned PrefabDocument snapshot. */
  prefabPath: string;
  source: AssetSource & { kind: "project" };
};

export const SCRIPT_ASSET_CONTRACT_VERSION = "1.0.0" as const;

export const SCRIPT_ASSET_LANGUAGES = ["ts", "tsx"] as const;
export type ScriptAssetLanguage = (typeof SCRIPT_ASSET_LANGUAGES)[number];

/**
 * Author-written behaviour attached through a `script` SceneComponent.
 *
 * The source text is a project file, never manifest content: keeping the
 * manifest entry stable across body edits is what stops a script save from
 * bumping every Entity revision in `synchronizePlaySession`. The declared
 * property schema is derived from the source and lives in Editor State.
 * See docs/SCRIPTING.md.
 */
export type ScriptAsset = AssetBase<"script"> & {
  contractVersion: typeof SCRIPT_ASSET_CONTRACT_VERSION;
  language: ScriptAssetLanguage;
  source: AssetSource & { kind: "project" };
};

export const SHADER_ASSET_CONTRACT_VERSION = "1.0.0" as const;

export const SHADER_ASSET_STAGES = ["vertex", "fragment"] as const;
export type ShaderAssetStage = (typeof SHADER_ASSET_STAGES)[number];

/** Imported GLSL source kept as a project file and edited in the Shader Editor. */
export type ShaderAsset = AssetBase<"shader"> & {
  contractVersion: typeof SHADER_ASSET_CONTRACT_VERSION;
  language: "glsl";
  stage: ShaderAssetStage;
  source: AssetSource & { kind: "project" };
};

export type SceneAsset =
  | PrimitiveAsset
  | ModelAsset
  | MaterialAsset
  | TextureAsset
  | SkyboxAsset
  | ParticleAsset
  | InteractivityAsset
  | AudioAsset
  | FontAsset
  | ScriptAsset
  | ShaderAsset
  | TemplateAsset;

export type AssetManifest = {
  schemaVersion: typeof ASSET_MANIFEST_SCHEMA_VERSION;
  folders?: Record<string, AssetFolder>;
  assets: Record<string, SceneAsset>;
};

export type AssetFolder = {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
};

export type AddAssetResult = {
  manifest: AssetManifest;
  assetId: string;
  added: boolean;
  reason?: "duplicate-id" | "invalid-input";
};

export type CreateMaterialAssetInput = {
  id: string;
  name: string;
  source?: AssetSource;
  properties?: MaterialAssetPatch;
  folderId?: string | null;
};

export type CreateTextureAssetInput = {
  id: string;
  name: string;
  source: AssetSource;
  importSettings: TextureImportSettingsPatch;
  folderId?: string | null;
};

export function getMaterialAsset(
  manifest: AssetManifest,
  assetId: string,
): MaterialAsset | undefined {
  const asset = manifest.assets[assetId];
  return asset?.kind === "material" ? asset : undefined;
}

export function getTextureAsset(
  manifest: AssetManifest,
  assetId: string,
): TextureAsset | undefined {
  const asset = manifest.assets[assetId];
  return asset?.kind === "texture" ? asset : undefined;
}

export function isEnvironmentTextureAsset(
  asset: SceneAsset | undefined,
): asset is EnvironmentTextureAsset {
  return (
    asset?.kind === "texture" &&
    (asset.usage === "environment" ||
      asset.importMetadata?.sourceFormat === "hdr" ||
      asset.importMetadata?.sourceFormat === "exr")
  );
}

export function getTextureSourceFormat(
  asset: TextureAsset,
): TextureSourceFormat | undefined {
  if (asset.importMetadata?.sourceFormat) return asset.importMetadata.sourceFormat;
  if (asset.source.kind !== "project") return undefined;
  return textureSourceFormatForExtension(
    extensionOfPath(asset.source.relativePath),
  ) as TextureSourceFormat | undefined;
}

export function getAudioAsset(
  manifest: AssetManifest,
  assetId: string,
): AudioAsset | undefined {
  const asset = manifest.assets[assetId];
  return asset?.kind === "audio" ? asset : undefined;
}

export function getFontAsset(
  manifest: AssetManifest,
  assetId: string,
): FontAsset | undefined {
  const asset = manifest.assets[assetId];
  return asset?.kind === "font" ? asset : undefined;
}

export function getGeometryAsset(
  manifest: AssetManifest,
  assetId: string,
): GeometryAsset | undefined {
  const asset = manifest.assets[assetId];
  return asset?.kind === "primitive" || asset?.kind === "model"
    ? asset
    : undefined;
}

export function getModelAsset(
  manifest: AssetManifest,
  assetId: string,
): ModelAsset | undefined {
  const asset = manifest.assets[assetId];
  return asset?.kind === "model" ? asset : undefined;
}

export function normalizeModelImportSettings(
  patch: ModelImportSettingsPatch = {},
  fallback: ModelImportSettings = DEFAULT_MODEL_IMPORT_SETTINGS,
): ModelImportSettings {
  const fallbackScale =
    typeof fallback.scale === "number" &&
    Number.isFinite(fallback.scale) &&
    fallback.scale > 0
      ? fallback.scale
      : DEFAULT_MODEL_IMPORT_SETTINGS.scale;
  return {
    scale:
      typeof patch.scale === "number" &&
      Number.isFinite(patch.scale) &&
      patch.scale > 0
        ? patch.scale
        : fallbackScale,
    generateColliders:
      typeof patch.generateColliders === "boolean"
        ? patch.generateColliders
        : typeof fallback.generateColliders === "boolean"
          ? fallback.generateColliders
          : DEFAULT_MODEL_IMPORT_SETTINGS.generateColliders,
    optimizeMeshes:
      typeof patch.optimizeMeshes === "boolean"
        ? patch.optimizeMeshes
        : typeof fallback.optimizeMeshes === "boolean"
          ? fallback.optimizeMeshes
          : DEFAULT_MODEL_IMPORT_SETTINGS.optimizeMeshes,
    importAnimations:
      typeof patch.importAnimations === "boolean"
        ? patch.importAnimations
        : typeof fallback.importAnimations === "boolean"
          ? fallback.importAnimations
          : DEFAULT_MODEL_IMPORT_SETTINGS.importAnimations,
  };
}

/** Updates only authorable Model fields; derived import metadata stays sealed. */
export function updateModelAsset(
  manifest: AssetManifest,
  assetId: string,
  patch: ModelAssetPatch,
): AssetManifest {
  const asset = getModelAsset(manifest, assetId);
  if (!asset) return manifest;

  const importSettings = normalizeModelImportSettings(
    patch.importSettings,
    normalizeModelImportSettings(asset.importSettings),
  );
  const bindings = patch.materialSlotBindings;
  const materialSlots = bindings
    ? asset.materialSlots.map((slot) => {
        if (!hasOwn(bindings, slot.slot)) return { ...slot };
        const requested = bindings[slot.slot];
        if (requested === null) {
          const { defaultMaterialAssetId: _removed, ...withoutBinding } = slot;
          return withoutBinding;
        }
        if (typeof requested !== "string") return { ...slot };
        const materialAssetId = requested.trim();
        if (manifest.assets[materialAssetId]?.kind !== "material") {
          return { ...slot };
        }
        return { ...slot, defaultMaterialAssetId: materialAssetId };
      })
    : asset.materialSlots.map((slot) => ({ ...slot }));

  if (
    jsonEqual(importSettings, asset.importSettings) &&
    jsonEqual(materialSlots, asset.materialSlots)
  ) {
    return manifest;
  }
  return {
    ...manifest,
    assets: {
      ...manifest.assets,
      [assetId]: { ...asset, importSettings, materialSlots },
    },
  };
}

/** Builtin primitives are creation tools, not user library assets. */
export function isUserLibraryAsset(asset: SceneAsset): boolean {
  return asset.kind !== "primitive";
}

export function getGeometryMaterialSlots(
  asset: GeometryAsset,
): MaterialSlotDefinition[] {
  const slots = Array.isArray(asset.materialSlots)
    ? asset.materialSlots.filter(isValidMaterialSlotDefinition)
    : [];

  if (slots.length > 0) return slots.map((slot) => ({ ...slot }));

  // A migration fallback for 0.1 prototype primitive documents.
  if (asset.kind === "primitive" && asset.defaultMaterialAssetId) {
    return [
      {
        slot: "default",
        name: "Default",
        defaultMaterialAssetId: asset.defaultMaterialAssetId,
      },
    ];
  }

  return [];
}

export function isValidMaterialSlotDefinition(
  slot: MaterialSlotDefinition,
): boolean {
  return (
    typeof slot.slot === "string" &&
    slot.slot.trim().length > 0 &&
    typeof slot.name === "string" &&
    slot.name.trim().length > 0 &&
    (slot.sourceMaterialIndex === undefined ||
      (Number.isInteger(slot.sourceMaterialIndex) &&
        slot.sourceMaterialIndex >= 0))
  );
}

export type MaterialTextureTransformPatch = {
  offset?: [number, number];
  rotation?: number;
  scale?: [number, number];
};

export type MaterialTextureInfoPatch =
  | string
  | {
      textureAssetId: string;
      texCoord?: number;
      /** `null` removes the optional transform and restores glTF defaults. */
      transform?: MaterialTextureTransformPatch | null;
    }
  | null;

export type NormalTextureInfoPatch =
  | string
  | {
      textureAssetId: string;
      texCoord?: number;
      scale?: number;
      transform?: MaterialTextureTransformPatch | null;
    }
  | null;

export type OcclusionTextureInfoPatch =
  | string
  | {
      textureAssetId: string;
      texCoord?: number;
      strength?: number;
      transform?: MaterialTextureTransformPatch | null;
    }
  | null;

export type PbrMetallicRoughnessPatch = {
  baseColorFactor?: Color4;
  baseColorTexture?: MaterialTextureInfoPatch;
  metallicFactor?: number;
  roughnessFactor?: number;
  metallicRoughnessTexture?: MaterialTextureInfoPatch;
};

export type KhrMaterialsIridescencePatch = {
  iridescenceFactor?: number;
  iridescenceTexture?: MaterialTextureInfoPatch;
  iridescenceIor?: number;
  iridescenceThicknessMinimum?: number;
  iridescenceThicknessMaximum?: number;
  iridescenceThicknessTexture?: MaterialTextureInfoPatch;
};

export type KhrMaterialsClearcoatPatch = {
  clearcoatFactor?: number;
  clearcoatTexture?: MaterialTextureInfoPatch;
  clearcoatRoughnessFactor?: number;
  clearcoatRoughnessTexture?: MaterialTextureInfoPatch;
  clearcoatNormalTexture?: NormalTextureInfoPatch;
};

export type KhrMaterialsTransmissionPatch = {
  transmissionFactor?: number;
  transmissionTexture?: MaterialTextureInfoPatch;
};

export type KhrMaterialsIorPatch = {
  ior?: number;
};

export type KhrMaterialsEmissiveStrengthPatch = {
  emissiveStrength?: number;
};

export type KhrMaterialsUnlitPatch = Record<string, never>;

export type KhrMaterialsVolumePatch = {
  thicknessFactor?: number;
  thicknessTexture?: MaterialTextureInfoPatch;
  /** `null` restores the glTF default of infinite attenuation distance. */
  attenuationDistance?: number | null;
  attenuationColor?: Color3;
};

export type KhrMaterialsSheenPatch = {
  sheenColorFactor?: Color3;
  sheenColorTexture?: MaterialTextureInfoPatch;
  sheenRoughnessFactor?: number;
  sheenRoughnessTexture?: MaterialTextureInfoPatch;
};

export type KhrMaterialsSpecularPatch = {
  specularFactor?: number;
  specularTexture?: MaterialTextureInfoPatch;
  specularColorFactor?: Color3;
  specularColorTexture?: MaterialTextureInfoPatch;
};

export type KhrMaterialsAnisotropyPatch = {
  anisotropyStrength?: number;
  anisotropyRotation?: number;
  anisotropyTexture?: MaterialTextureInfoPatch;
};

export type KhrMaterialsDispersionPatch = {
  dispersion?: number;
};

export interface MaterialExtensionPatchRegistry {
  KHR_materials_anisotropy: KhrMaterialsAnisotropyPatch;
  KHR_materials_clearcoat: KhrMaterialsClearcoatPatch;
  KHR_materials_dispersion: KhrMaterialsDispersionPatch;
  KHR_materials_emissive_strength: KhrMaterialsEmissiveStrengthPatch;
  KHR_materials_ior: KhrMaterialsIorPatch;
  KHR_materials_iridescence: KhrMaterialsIridescencePatch;
  KHR_materials_sheen: KhrMaterialsSheenPatch;
  KHR_materials_specular: KhrMaterialsSpecularPatch;
  KHR_materials_transmission: KhrMaterialsTransmissionPatch;
  KHR_materials_unlit: KhrMaterialsUnlitPatch;
  KHR_materials_volume: KhrMaterialsVolumePatch;
}

export type MaterialExtensionsPatch = Partial<{
  [Name in keyof MaterialExtensionPatchRegistry]:
    | MaterialExtensionPatchRegistry[Name]
    | null;
}>;

export type MaterialAssetPatch = {
  shader?: MaterialShader | null;
  pbrMetallicRoughness?: PbrMetallicRoughnessPatch;
  normalTexture?: NormalTextureInfoPatch;
  occlusionTexture?: OcclusionTextureInfoPatch;
  emissiveFactor?: Color3;
  emissiveTexture?: MaterialTextureInfoPatch;
  alphaMode?: MaterialAlphaMode;
  alphaCutoff?: number;
  doubleSided?: boolean;
  blending?: MaterialBlendMode;
  depthWrite?: MaterialDepthWrite;
  alphaToCoverage?: boolean;
  extensions?: MaterialExtensionsPatch;

  /** Migration-friendly prototype aliases. */
  color?: string;
  opacity?: number;
  metalness?: number;
  roughness?: number;
  baseColorTextureId?: string | null;
  normalTextureId?: string | null;
  occlusionTextureId?: string | null;
  metallicRoughnessTextureId?: string | null;
  emissiveTextureId?: string | null;
};

const DEFAULT_MATERIAL_PROPERTIES: MaterialProperties = {
  pbrMetallicRoughness: {
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 1,
    roughnessFactor: 1,
  },
  emissiveFactor: [0, 0, 0],
  alphaMode: "OPAQUE",
  alphaCutoff: 0.5,
  doubleSided: false,
  blending: "normal",
  depthWrite: "auto",
  alphaToCoverage: false,
  extensions: {},
  color: "#ffffff",
  opacity: 1,
  metalness: 1,
  roughness: 1,
};

export function isMaterialAlphaMode(value: unknown): value is MaterialAlphaMode {
  return value === "OPAQUE" || value === "MASK" || value === "BLEND";
}

export const MATERIAL_BLEND_MODES = [
  "normal",
  "additive",
  "multiply",
  "subtractive",
] as const;

export function isMaterialBlendMode(value: unknown): value is MaterialBlendMode {
  return MATERIAL_BLEND_MODES.includes(value as MaterialBlendMode);
}

export const MATERIAL_DEPTH_WRITE_MODES = ["auto", "on", "off"] as const;

export function isMaterialDepthWrite(
  value: unknown,
): value is MaterialDepthWrite {
  return MATERIAL_DEPTH_WRITE_MODES.includes(value as MaterialDepthWrite);
}

/**
 * The three.js constant a blend mode maps to.
 *
 * Returned as a name rather than the constant so the document layer stays free
 * of three, and so the compiler can emit the identifier while the editor looks
 * it up. One mapping, both surfaces.
 */
export function materialBlendingConstant(
  mode: MaterialBlendMode,
):
  | "NormalBlending"
  | "AdditiveBlending"
  | "MultiplyBlending"
  | "SubtractiveBlending" {
  if (mode === "additive") return "AdditiveBlending";
  if (mode === "multiply") return "MultiplyBlending";
  if (mode === "subtractive") return "SubtractiveBlending";
  return "NormalBlending";
}

/**
 * Whether the surface has to be drawn in the transparent pass.
 *
 * A blend mode other than normal only does anything there: an additive surface
 * drawn opaquely simply covers what is behind it, which is the opposite of what
 * the author asked for.
 */
export function materialIsTransparent(properties: {
  alphaMode: MaterialAlphaMode;
  blending: MaterialBlendMode;
}): boolean {
  return properties.alphaMode === "BLEND" || properties.blending !== "normal";
}

/**
 * Whether a Material writes depth, once `auto` is resolved.
 *
 * Blended surfaces skip the depth buffer by default because two of them would
 * otherwise erase each other in whatever order they happened to draw.
 */
export function materialWritesDepth(properties: {
  alphaMode: MaterialAlphaMode;
  depthWrite: MaterialDepthWrite;
}): boolean {
  if (properties.depthWrite === "on") return true;
  if (properties.depthWrite === "off") return false;
  return properties.alphaMode !== "BLEND";
}

/**
 * Every three.js prop the alpha settings decide, resolved once.
 *
 * The editor viewport, the Material preview and the compiler all call this
 * rather than deriving the props from `alphaMode` themselves. Three separate
 * derivations is how a Material comes to look one way while being authored and
 * another once published.
 */
export function materialAlphaRenderProps(properties: {
  alphaMode: MaterialAlphaMode;
  alphaCutoff: number;
  blending: MaterialBlendMode;
  depthWrite: MaterialDepthWrite;
  alphaToCoverage: boolean;
}): {
  transparent: boolean;
  depthWrite: boolean;
  blending: ReturnType<typeof materialBlendingConstant>;
  alphaTest: number;
  alphaToCoverage: boolean;
} {
  return {
    transparent: materialIsTransparent(properties),
    depthWrite: materialWritesDepth(properties),
    blending: materialBlendingConstant(properties.blending),
    // MASK is the only mode that clips; a cutoff on a blended surface would
    // punch holes the author never asked for.
    alphaTest: properties.alphaMode === "MASK" ? properties.alphaCutoff : 0,
    alphaToCoverage: properties.alphaToCoverage,
  };
}

export function isUnitInterval(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

export function isValidColor3(value: unknown): value is Color3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(isUnitInterval)
  );
}

export function isValidColor4(value: unknown): value is Color4 {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(isUnitInterval)
  );
}

export function normalizeMaterialProperties(
  input: MaterialAssetPatch = {},
): MaterialProperties {
  return applyMaterialPatch(DEFAULT_MATERIAL_PROPERTIES, input);
}

export function createDefaultMaterialAsset(
  input: CreateMaterialAssetInput,
): MaterialAsset | null {
  const id = input.id.trim();
  const name = input.name.trim();
  if (id.length === 0 || name.length === 0) return null;

  return {
    id,
    name,
    kind: "material",
    status: "ready",
    source: normalizeAssetSource(input.source, { kind: "document" }),
    thumbnail: { status: "missing" },
    folderId: normalizeOptionalId(input.folderId),
    properties: normalizeMaterialProperties(input.properties),
  };
}

export function addDefaultMaterialAsset(
  manifest: AssetManifest,
  input: CreateMaterialAssetInput,
): AddAssetResult {
  const asset = createDefaultMaterialAsset(input);
  if (!asset) {
    return {
      manifest,
      assetId: input.id,
      added: false,
      reason: "invalid-input",
    };
  }
  if (manifest.assets[asset.id]) {
    return {
      manifest,
      assetId: asset.id,
      added: false,
      reason: "duplicate-id",
    };
  }
  if (!isExistingFolder(manifest, asset.folderId)) {
    return {
      manifest,
      assetId: asset.id,
      added: false,
      reason: "invalid-input",
    };
  }

  return {
    manifest: {
      ...manifest,
      assets: {
        ...manifest.assets,
        [asset.id]: {
          ...asset,
          order: nextAssetOrder(manifest, asset.folderId ?? null),
        },
      },
    },
    assetId: asset.id,
    added: true,
  };
}

export function updateMaterialAsset(
  manifest: AssetManifest,
  assetId: string,
  patch: MaterialAssetPatch,
): AssetManifest {
  const asset = getMaterialAsset(manifest, assetId);
  if (!asset) return manifest;

  // Normalizing first migrates an old prototype document without discarding it.
  const current = normalizeMaterialProperties(
    asset.properties as unknown as MaterialAssetPatch,
  );
  const properties = applyMaterialPatch(current, patch, manifest);
  const shader = patch.shader === null ? undefined : patch.shader ?? asset.shader;

  if (
    jsonEqual(properties, asset.properties) &&
    jsonEqual(shader, asset.shader)
  ) {
    return manifest;
  }

  const nextAsset: MaterialAsset = {
    ...asset,
    properties,
  };
  if (shader) nextAsset.shader = shader;
  else delete nextAsset.shader;

  return {
    ...manifest,
    assets: {
      ...manifest.assets,
      [assetId]: {
        ...nextAsset,
        ...(asset.thumbnail?.status === "generated"
          ? { thumbnail: { ...asset.thumbnail, status: "stale" as const } }
          : {}),
        ...(asset.importedFromModel
          ? {
              importedFromModel: {
                ...asset.importedFromModel,
                isUserOverridden: true,
              },
            }
          : {}),
      },
    },
  };
}

function applyMaterialPatch(
  current: MaterialProperties,
  patch: MaterialAssetPatch,
  manifest?: AssetManifest,
): MaterialProperties {
  const currentPbr = current.pbrMetallicRoughness;
  const pbrPatch = patch.pbrMetallicRoughness;
  let baseColorFactor = cloneColor4(currentPbr.baseColorFactor);

  if (pbrPatch?.baseColorFactor !== undefined) {
    if (isValidColor4(pbrPatch.baseColorFactor)) {
      baseColorFactor = cloneColor4(pbrPatch.baseColorFactor);
    }
  } else {
    const rgb = normalizeHexColor(patch.color);
    if (rgb) {
      baseColorFactor = [rgb[0], rgb[1], rgb[2], baseColorFactor[3]];
    }
    if (patch.opacity !== undefined && isUnitInterval(patch.opacity)) {
      baseColorFactor[3] = patch.opacity;
    }
  }

  const metallicFactor = pickUnitValue(
    pbrPatch?.metallicFactor,
    patch.metalness,
    currentPbr.metallicFactor,
  );
  const roughnessFactor = pickUnitValue(
    pbrPatch?.roughnessFactor,
    patch.roughness,
    currentPbr.roughnessFactor,
  );

  const baseColorTexture = resolveChosenTextureInfo(
    pbrPatch,
    "baseColorTexture",
    patch,
    "baseColorTextureId",
    currentPbr.baseColorTexture,
    manifest,
  );
  const metallicRoughnessTexture = resolveChosenTextureInfo(
    pbrPatch,
    "metallicRoughnessTexture",
    patch,
    "metallicRoughnessTextureId",
    currentPbr.metallicRoughnessTexture,
    manifest,
  );
  const normalTexture = resolveChosenNormalTextureInfo(
    patch,
    current.normalTexture,
    manifest,
  );
  const occlusionTexture = resolveChosenOcclusionTextureInfo(
    patch,
    current.occlusionTexture,
    manifest,
  );
  const emissiveTexture = resolveChosenTextureInfo(
    patch,
    "emissiveTexture",
    patch,
    "emissiveTextureId",
    current.emissiveTexture,
    manifest,
  );

  const pbrMetallicRoughness: PbrMetallicRoughnessProperties = {
    baseColorFactor,
    metallicFactor,
    roughnessFactor,
    ...(baseColorTexture ? { baseColorTexture } : {}),
    ...(metallicRoughnessTexture ? { metallicRoughnessTexture } : {}),
  };

  const emissiveFactor = isValidColor3(patch.emissiveFactor)
    ? cloneColor3(patch.emissiveFactor)
    : cloneColor3(current.emissiveFactor);
  const alphaMode = isMaterialAlphaMode(patch.alphaMode)
    ? patch.alphaMode
    : current.alphaMode;
  const alphaCutoff =
    typeof patch.alphaCutoff === "number" &&
    Number.isFinite(patch.alphaCutoff) &&
    patch.alphaCutoff >= 0
      ? patch.alphaCutoff
      : current.alphaCutoff;
  const doubleSided =
    typeof patch.doubleSided === "boolean"
      ? patch.doubleSided
      : current.doubleSided;
  const blending = isMaterialBlendMode(patch.blending)
    ? patch.blending
    : current.blending;
  const depthWrite = isMaterialDepthWrite(patch.depthWrite)
    ? patch.depthWrite
    : current.depthWrite;
  const alphaToCoverage =
    typeof patch.alphaToCoverage === "boolean"
      ? patch.alphaToCoverage
      : current.alphaToCoverage;
  const extensions = applyMaterialExtensionsPatch(
    current.extensions,
    patch.extensions,
    manifest,
  );

  return {
    pbrMetallicRoughness,
    ...(normalTexture ? { normalTexture } : {}),
    ...(occlusionTexture ? { occlusionTexture } : {}),
    emissiveFactor,
    ...(emissiveTexture ? { emissiveTexture } : {}),
    alphaMode,
    alphaCutoff,
    doubleSided,
    blending,
    depthWrite,
    alphaToCoverage,
    extensions,
    color: color3ToHex(baseColorFactor),
    opacity: baseColorFactor[3],
    metalness: metallicFactor,
    roughness: roughnessFactor,
    ...(baseColorTexture
      ? { baseColorTextureId: baseColorTexture.textureAssetId }
      : {}),
    ...(normalTexture
      ? { normalTextureId: normalTexture.textureAssetId }
      : {}),
    ...(occlusionTexture
      ? { occlusionTextureId: occlusionTexture.textureAssetId }
      : {}),
    ...(metallicRoughnessTexture
      ? {
          metallicRoughnessTextureId:
            metallicRoughnessTexture.textureAssetId,
        }
      : {}),
    ...(emissiveTexture
      ? { emissiveTextureId: emissiveTexture.textureAssetId }
      : {}),
  };
}

type ExtensionRecord = Record<string, unknown>;

const EXTENSION_NUMBER_VALIDATORS: Readonly<
  Record<string, (value: unknown) => value is number>
> = {
  unit: isUnitInterval,
  nonNegative: isNonNegativeFinite,
  finite: isFiniteNumber,
  atLeastOne: ((value: unknown): value is number =>
    isFiniteNumber(value) && value >= 1) as (value: unknown) => value is number,
  ior: isValidMaterialIor,
};

function applyExtensionFields(
  fields: readonly MaterialExtensionFieldDescriptor[],
  base: ExtensionRecord | undefined,
  requested: ExtensionRecord,
  manifest?: AssetManifest,
): ExtensionRecord {
  const next: ExtensionRecord = {};
  for (const field of fields) {
    const current = base?.[field.name];
    switch (field.kind) {
      case "texture": {
        const value = hasOwn(requested, field.name)
          ? resolveTextureInfo(
              requested[field.name] as MaterialTextureInfoPatch,
              current as MaterialTextureInfo | undefined,
              manifest,
            )
          : cloneTextureInfo(current as MaterialTextureInfo | undefined);
        if (value) next[field.name] = value;
        break;
      }
      case "normalTexture": {
        const value = hasOwn(requested, field.name)
          ? resolveNormalTextureInfo(
              requested[field.name] as NormalTextureInfoPatch,
              current as NormalTextureInfo | undefined,
              manifest,
            )
          : cloneNormalTextureInfo(current as NormalTextureInfo | undefined);
        if (value) next[field.name] = value;
        break;
      }
      case "positiveOptional": {
        let value = current as number | undefined;
        if (hasOwn(requested, field.name)) {
          const candidate = requested[field.name];
          if (candidate === null) value = undefined;
          else if (isPositiveFinite(candidate)) value = candidate;
        }
        if (value !== undefined) next[field.name] = value;
        break;
      }
      case "unitColor3":
      case "nonNegativeColor3": {
        const isValid =
          field.kind === "unitColor3" ? isValidColor3 : isNonNegativeColor3;
        const candidate = requested[field.name];
        next[field.name] = isValid(candidate)
          ? cloneColor3(candidate)
          : cloneColor3((current as Color3 | undefined) ?? field.default);
        break;
      }
      default: {
        const isValid = EXTENSION_NUMBER_VALIDATORS[field.kind];
        const candidate = requested[field.name];
        next[field.name] = isValid(candidate)
          ? candidate
          : ((current as number | undefined) ?? field.default);
        break;
      }
    }
  }
  return next;
}

function applyMaterialExtensionsPatch(
  current: MaterialExtensions,
  patch: MaterialExtensionsPatch | undefined,
  manifest?: AssetManifest,
): MaterialExtensions {
  const next = cloneMaterialExtensions(current) as Record<
    MaterialExtensionName,
    ExtensionRecord | undefined
  >;
  if (!patch) return next as MaterialExtensions;

  for (const name of MATERIAL_EXTENSION_NAMES) {
    if (!hasOwn(patch, name)) continue;
    const requested = patch[name];
    if (requested === null) {
      delete next[name];
      continue;
    }
    if (requested === undefined) continue;
    next[name] = applyExtensionFields(
      MATERIAL_EXTENSION_DESCRIPTORS[name].fields,
      next[name],
      requested as ExtensionRecord,
      manifest,
    );
  }
  return next as MaterialExtensions;
}

function cloneMaterialExtensions(
  extensions: MaterialExtensions,
): MaterialExtensions {
  const result: Record<MaterialExtensionName, ExtensionRecord | undefined> =
    {} as never;
  for (const name of MATERIAL_EXTENSION_NAMES) {
    const value = extensions[name] as ExtensionRecord | undefined;
    if (!value) continue;
    const clone: ExtensionRecord = { ...value };
    for (const field of MATERIAL_EXTENSION_DESCRIPTORS[name].fields) {
      if (!hasOwn(clone, field.name)) continue;
      if (field.kind === "unitColor3" || field.kind === "nonNegativeColor3") {
        clone[field.name] = cloneColor3(clone[field.name] as Color3);
      } else if (field.kind === "texture") {
        clone[field.name] = cloneTextureInfo(
          clone[field.name] as MaterialTextureInfo,
        );
      } else if (field.kind === "normalTexture") {
        clone[field.name] = cloneNormalTextureInfo(
          clone[field.name] as NormalTextureInfo,
        );
      }
    }
    result[name] = clone;
  }
  return result as MaterialExtensions;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidMaterialIor(value: unknown): value is number {
  return isFiniteNumber(value) && (value === 0 || value >= 1);
}

function isNonNegativeColor3(value: unknown): value is Color3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(isNonNegativeFinite)
  );
}

function resolveChosenTextureInfo<
  Canonical extends object,
  CanonicalKey extends keyof Canonical,
  Legacy extends object,
  LegacyKey extends keyof Legacy,
>(
  canonical: Canonical | undefined,
  canonicalKey: CanonicalKey,
  legacy: Legacy,
  legacyKey: LegacyKey,
  fallback: MaterialTextureInfo | undefined,
  manifest?: AssetManifest,
): MaterialTextureInfo | undefined {
  if (canonical && hasOwn(canonical, canonicalKey)) {
    return resolveTextureInfo(
      canonical[canonicalKey] as MaterialTextureInfoPatch,
      fallback,
      manifest,
    );
  }
  if (hasOwn(legacy, legacyKey)) {
    return resolveTextureInfo(
      legacy[legacyKey] as string | null | undefined,
      fallback,
      manifest,
    );
  }
  return cloneTextureInfo(fallback);
}

function resolveChosenNormalTextureInfo(
  patch: MaterialAssetPatch,
  fallback: NormalTextureInfo | undefined,
  manifest?: AssetManifest,
): NormalTextureInfo | undefined {
  const value = hasOwn(patch, "normalTexture")
    ? patch.normalTexture
    : hasOwn(patch, "normalTextureId")
      ? patch.normalTextureId
      : undefined;
  return resolveNormalTextureInfo(value, fallback, manifest);
}

function resolveNormalTextureInfo(
  value: NormalTextureInfoPatch | undefined,
  fallback: NormalTextureInfo | undefined,
  manifest?: AssetManifest,
): NormalTextureInfo | undefined {
  if (value === undefined) return cloneNormalTextureInfo(fallback);
  if (value === null) return undefined;

  const base = resolveTextureInfo(value, fallback, manifest);
  if (!base) return cloneNormalTextureInfo(fallback);
  const fallbackScale = fallback?.scale ?? 1;
  const scale =
    typeof value === "object" && value.scale !== undefined
      ? typeof value.scale === "number" && Number.isFinite(value.scale)
        ? value.scale
        : fallbackScale
      : base.textureAssetId === fallback?.textureAssetId
        ? fallbackScale
        : 1;
  return { ...base, scale };
}

function resolveChosenOcclusionTextureInfo(
  patch: MaterialAssetPatch,
  fallback: OcclusionTextureInfo | undefined,
  manifest?: AssetManifest,
): OcclusionTextureInfo | undefined {
  const value = hasOwn(patch, "occlusionTexture")
    ? patch.occlusionTexture
    : hasOwn(patch, "occlusionTextureId")
      ? patch.occlusionTextureId
      : undefined;
  if (value === undefined) return cloneOcclusionTextureInfo(fallback);
  if (value === null) return undefined;

  const base = resolveTextureInfo(value, fallback, manifest);
  if (!base) return cloneOcclusionTextureInfo(fallback);
  const fallbackStrength = fallback?.strength ?? 1;
  const strength =
    typeof value === "object" && value.strength !== undefined
      ? isUnitInterval(value.strength)
        ? value.strength
        : fallbackStrength
      : base.textureAssetId === fallback?.textureAssetId
        ? fallbackStrength
        : 1;
  return { ...base, strength };
}

function resolveTextureInfo(
  value: MaterialTextureInfoPatch | undefined,
  fallback: MaterialTextureInfo | undefined,
  manifest?: AssetManifest,
): MaterialTextureInfo | undefined {
  if (value === undefined) return cloneTextureInfo(fallback);
  if (value === null) return undefined;

  const textureAssetId =
    typeof value === "string" ? value.trim() : value.textureAssetId.trim();
  if (
    textureAssetId.length === 0 ||
    (manifest && !getTextureAsset(manifest, textureAssetId))
  ) {
    return cloneTextureInfo(fallback);
  }

  const requestedTexCoord = typeof value === "string" ? undefined : value.texCoord;
  const texCoord =
    requestedTexCoord === undefined
      ? textureAssetId === fallback?.textureAssetId
        ? fallback.texCoord
        : 0
      : Number.isInteger(requestedTexCoord) && requestedTexCoord >= 0
        ? requestedTexCoord
        : undefined;
  if (texCoord === undefined) return cloneTextureInfo(fallback);

  const sameTexture = textureAssetId === fallback?.textureAssetId;
  const fallbackTransform = sameTexture ? fallback?.transform : undefined;
  let transform = cloneTextureTransform(fallbackTransform);
  if (typeof value !== "string" && hasOwn(value, "transform")) {
    if (value.transform === null) {
      transform = undefined;
    } else if (value.transform !== undefined) {
      const offset = value.transform.offset ?? fallbackTransform?.offset ?? [0, 0];
      const rotation = value.transform.rotation ?? fallbackTransform?.rotation ?? 0;
      const scale = value.transform.scale ?? fallbackTransform?.scale ?? [1, 1];
      if (
        !isFiniteVector2(offset) ||
        !isFiniteNumber(rotation) ||
        !isFiniteVector2(scale)
      ) {
        return cloneTextureInfo(fallback);
      }
      transform = isDefaultTextureTransform(offset, rotation, scale)
        ? undefined
        : {
            offset: [offset[0], offset[1]],
            rotation,
            scale: [scale[0], scale[1]],
          };
    }
  }

  return {
    textureAssetId,
    texCoord,
    ...(transform ? { transform } : {}),
  };
}

function isFiniteVector2(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(isFiniteNumber)
  );
}

function isDefaultTextureTransform(
  offset: [number, number],
  rotation: number,
  scale: [number, number],
): boolean {
  return (
    offset[0] === 0 &&
    offset[1] === 0 &&
    rotation === 0 &&
    scale[0] === 1 &&
    scale[1] === 1
  );
}

function pickUnitValue(
  canonical: unknown,
  legacy: unknown,
  fallback: number,
): number {
  if (canonical !== undefined) return isUnitInterval(canonical) ? canonical : fallback;
  return legacy !== undefined && isUnitInterval(legacy) ? legacy : fallback;
}

function normalizeHexColor(value: unknown): Color3 | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(normalized)) return undefined;
  return [
    Number.parseInt(normalized.slice(1, 3), 16) / 255,
    Number.parseInt(normalized.slice(3, 5), 16) / 255,
    Number.parseInt(normalized.slice(5, 7), 16) / 255,
  ];
}

function color3ToHex(value: Color3 | Color4): string {
  return `#${value
    .slice(0, 3)
    .map((entry) => Math.round(entry * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function cloneColor3(value: Color3): Color3 {
  return [value[0], value[1], value[2]];
}

function cloneColor4(value: Color4): Color4 {
  return [value[0], value[1], value[2], value[3]];
}

function cloneTextureInfo(
  value: MaterialTextureInfo | undefined,
): MaterialTextureInfo | undefined {
  return value
    ? {
        ...value,
        ...(value.transform
          ? { transform: cloneTextureTransform(value.transform) }
          : {}),
      }
    : undefined;
}

function cloneNormalTextureInfo(
  value: NormalTextureInfo | undefined,
): NormalTextureInfo | undefined {
  return value
    ? {
        ...value,
        ...(value.transform
          ? { transform: cloneTextureTransform(value.transform) }
          : {}),
      }
    : undefined;
}

function cloneOcclusionTextureInfo(
  value: OcclusionTextureInfo | undefined,
): OcclusionTextureInfo | undefined {
  return value
    ? {
        ...value,
        ...(value.transform
          ? { transform: cloneTextureTransform(value.transform) }
          : {}),
      }
    : undefined;
}

function cloneTextureTransform(
  value: MaterialTextureTransform | undefined,
): MaterialTextureTransform | undefined {
  return value
    ? {
        offset: [value.offset[0], value.offset[1]],
        rotation: value.rotation,
        scale: [value.scale[0], value.scale[1]],
      }
    : undefined;
}

export const DEFAULT_TEXTURE_IMPORT_SETTINGS: TextureImportSettings = {
  colorSpace: "auto",
  generateMipmaps: true,
  flipY: false,
  resize: { mode: "original", powerOfTwo: false },
  sampler: {
    wrapS: "repeat",
    wrapT: "repeat",
    magFilter: "linear",
    minFilter: "linear-mipmap-linear",
  },
  compression: {
    format: "source",
    quality: 80,
  },
};

export type TextureImportSettingsPatch = {
  colorSpace?: TextureColorSpace;
  generateMipmaps?: boolean;
  flipY?: boolean;
  resize?: TextureResizeSettings;
  sampler?: Partial<TextureSamplerSettings>;
  compression?: Partial<TextureCompressionSettings>;
};

export type TextureAssetPatch = {
  source?: AssetSource;
  importSettings?: TextureImportSettingsPatch;
};

export function isTextureColorSpace(value: unknown): value is TextureColorSpace {
  return TEXTURE_COLOR_SPACES.includes(value as TextureColorSpace);
}

export function isTextureWrapMode(value: unknown): value is TextureWrapMode {
  return TEXTURE_WRAP_MODES.includes(value as TextureWrapMode);
}

export function isTextureMagFilter(value: unknown): value is TextureMagFilter {
  return TEXTURE_MAG_FILTERS.includes(value as TextureMagFilter);
}

export function isTextureMinFilter(value: unknown): value is TextureMinFilter {
  return TEXTURE_MIN_FILTERS.includes(value as TextureMinFilter);
}

export function isTextureCompressionFormat(
  value: unknown,
): value is TextureCompressionFormat {
  return TEXTURE_COMPRESSION_FORMATS.includes(value as TextureCompressionFormat);
}

export function isValidTextureMaxSize(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 16384;
}

export function isValidTextureCompressionQuality(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  );
}

export function normalizeTextureImportSettings(
  input: TextureImportSettingsPatch = {},
  fallback: TextureImportSettings = DEFAULT_TEXTURE_IMPORT_SETTINGS,
): TextureImportSettings {
  const colorSpace = isTextureColorSpace(input.colorSpace)
    ? input.colorSpace
    : fallback.colorSpace;
  const generateMipmaps =
    typeof input.generateMipmaps === "boolean"
      ? input.generateMipmaps
      : fallback.generateMipmaps;
  const flipY =
    typeof input.flipY === "boolean" ? input.flipY : fallback.flipY;
  const resize = normalizeTextureResize(input.resize, fallback.resize);

  const samplerPatch = input.sampler;
  const sampler: TextureSamplerSettings = {
    wrapS: isTextureWrapMode(samplerPatch?.wrapS)
      ? samplerPatch.wrapS
      : fallback.sampler.wrapS,
    wrapT: isTextureWrapMode(samplerPatch?.wrapT)
      ? samplerPatch.wrapT
      : fallback.sampler.wrapT,
    magFilter: isTextureMagFilter(samplerPatch?.magFilter)
      ? samplerPatch.magFilter
      : fallback.sampler.magFilter,
    minFilter: isTextureMinFilter(samplerPatch?.minFilter)
      ? samplerPatch.minFilter
      : fallback.sampler.minFilter,
  };
  if (!generateMipmaps && sampler.minFilter.includes("mipmap")) {
    sampler.minFilter = "linear";
  }

  const compressionPatch = input.compression;
  const compression: TextureCompressionSettings = {
    format: isTextureCompressionFormat(compressionPatch?.format)
      ? compressionPatch.format
      : fallback.compression.format,
    quality: isValidTextureCompressionQuality(compressionPatch?.quality)
      ? compressionPatch.quality
      : fallback.compression.quality,
  };

  return {
    colorSpace,
    generateMipmaps,
    flipY,
    resize,
    sampler,
    compression,
  };
}

export function updateTextureAsset(
  manifest: AssetManifest,
  assetId: string,
  patch: TextureAssetPatch,
): AssetManifest {
  const asset = getTextureAsset(manifest, assetId);
  if (!asset) return manifest;

  const currentSettings = normalizeTextureImportSettings(
    asset.importSettings as unknown as TextureImportSettingsPatch,
  );
  const importSettings = normalizeTextureImportSettings(
    patch.importSettings,
    currentSettings,
  );
  const source = normalizeAssetSource(patch.source, asset.source);

  if (jsonEqual(importSettings, asset.importSettings) && jsonEqual(source, asset.source)) {
    return manifest;
  }

  return {
    ...manifest,
    assets: {
      ...manifest.assets,
      [assetId]: {
        ...asset,
        source,
        importSettings,
        ...(isEnvironmentTextureAsset(asset) &&
        asset.thumbnail?.status === "generated"
          ? {
              thumbnail: {
                ...asset.thumbnail,
                status: "stale" as const,
              },
            }
          : {}),
        ...(asset.importedFromModel
          ? {
              importedFromModel: {
                ...asset.importedFromModel,
                isUserOverridden: true,
              },
            }
          : {}),
      },
    },
  };
}

export function createTextureAsset(
  input: CreateTextureAssetInput,
): TextureAsset | null {
  const id = input.id.trim();
  const name = input.name.trim();
  if (id.length === 0 || name.length === 0) return null;

  const source = normalizeAssetSource(input.source, { kind: "document" });
  // A rejected project source must not silently become embedded document data.
  if (input.source.kind === "project" && source.kind !== "project") return null;

  return {
    id,
    name,
    kind: "texture",
    status: "ready",
    source,
    thumbnail: { status: "missing" },
    folderId: normalizeOptionalId(input.folderId),
    importSettings: normalizeTextureImportSettings(input.importSettings),
  };
}

export function addTextureAsset(
  manifest: AssetManifest,
  input: CreateTextureAssetInput,
): AddAssetResult {
  const asset = createTextureAsset(input);
  if (!asset) {
    return {
      manifest,
      assetId: input.id,
      added: false,
      reason: "invalid-input",
    };
  }
  if (manifest.assets[asset.id]) {
    return {
      manifest,
      assetId: asset.id,
      added: false,
      reason: "duplicate-id",
    };
  }
  if (!isExistingFolder(manifest, asset.folderId)) {
    return {
      manifest,
      assetId: asset.id,
      added: false,
      reason: "invalid-input",
    };
  }

  return {
    manifest: {
      ...manifest,
      assets: {
        ...manifest.assets,
        [asset.id]: {
          ...asset,
          order: nextAssetOrder(manifest, asset.folderId ?? null),
        },
      },
    },
    assetId: asset.id,
    added: true,
  };
}

export function updateAssetThumbnail(
  manifest: AssetManifest,
  assetId: string,
  thumbnail: AssetThumbnailDescriptor,
): AssetManifest {
  const asset = manifest.assets[assetId];
  if (!asset) return manifest;
  const normalized = normalizeAssetThumbnail(thumbnail, asset.thumbnail);
  if (!normalized || jsonEqual(normalized, asset.thumbnail)) return manifest;
  return {
    ...manifest,
    assets: {
      ...manifest.assets,
      [assetId]: { ...asset, thumbnail: normalized },
    },
  };
}

export function normalizeAssetThumbnail(
  thumbnail: AssetThumbnailDescriptor,
  fallback?: AssetThumbnailDescriptor,
): AssetThumbnailDescriptor | undefined {
  if (thumbnail.status === "missing") return { status: "missing" };

  const derivedPath = normalizeProjectRelativePath(thumbnail.derivedPath);
  const sourceHash = thumbnail.sourceHash.trim();
  const rendererVersion = thumbnail.rendererVersion.trim();
  if (!derivedPath || sourceHash.length === 0 || rendererVersion.length === 0) {
    return fallback ? cloneAssetThumbnail(fallback) : undefined;
  }
  return {
    status: thumbnail.status,
    derivedPath,
    sourceHash,
    rendererVersion,
  };
}

export function normalizeAssetSource(
  source: AssetSource | undefined,
  fallback: AssetSource,
): AssetSource {
  if (!source) return { ...fallback };
  if (source.kind === "document") return { kind: "document" };
  if (source.kind === "builtin") {
    const key = source.key.trim();
    return key.length > 0 ? { kind: "builtin", key } : { ...fallback };
  }

  const relativePath = normalizeProjectRelativePath(source.relativePath);
  return relativePath ? { kind: "project", relativePath } : { ...fallback };
}

export function normalizeProjectRelativePath(value: string): string | undefined {
  const relativePath = value.trim().replace(/\\/g, "/");
  const segments = relativePath.split("/");
  const isRelative =
    relativePath.length > 0 &&
    !relativePath.startsWith("/") &&
    !/^[a-zA-Z]:/.test(relativePath) &&
    !relativePath.includes("://") &&
    segments.every(
      (segment) => segment !== ".." && segment !== "." && segment.length > 0,
    );
  return isRelative ? relativePath : undefined;
}

export type AddAssetFolderResult = {
  manifest: AssetManifest;
  folderId: string;
  added: boolean;
  reason?: "duplicate-id" | "duplicate-name" | "invalid-input";
};

export function isValidAssetFolderName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const name = value.trim();
  return (
    name.length > 0 &&
    name.length <= 100 &&
    name !== "." &&
    name !== ".." &&
    !/[\\/\0]/.test(name)
  );
}

export function addAssetFolder(
  manifest: AssetManifest,
  input: { id: string; name: string; parentId?: string | null },
): AddAssetFolderResult {
  const id = input.id.trim();
  const name = input.name.trim();
  const parentId = normalizeOptionalId(input.parentId) ?? null;
  if (!id || !isValidAssetFolderName(name) || !isExistingFolder(manifest, parentId)) {
    return {
      manifest,
      folderId: id,
      added: false,
      reason: "invalid-input",
    };
  }
  if (manifest.folders?.[id]) {
    return {
      manifest,
      folderId: id,
      added: false,
      reason: "duplicate-id",
    };
  }
  if (hasSiblingFolderName(manifest, parentId, name)) {
    return {
      manifest,
      folderId: id,
      added: false,
      reason: "duplicate-name",
    };
  }

  const folder: AssetFolder = {
    id,
    name,
    parentId,
    order: nextSiblingOrder(manifest, parentId),
  };
  return {
    manifest: {
      ...manifest,
      folders: { ...(manifest.folders ?? {}), [id]: folder },
    },
    folderId: id,
    added: true,
  };
}

export function renameAssetFolder(
  manifest: AssetManifest,
  folderId: string,
  name: string,
): AssetManifest {
  const folder = manifest.folders?.[folderId];
  const normalizedName = name.trim();
  if (
    !folder ||
    !isValidAssetFolderName(normalizedName) ||
    normalizedName === folder.name ||
    hasSiblingFolderName(manifest, folder.parentId, normalizedName, folder.id)
  ) {
    return manifest;
  }
  return {
    ...manifest,
    folders: {
      ...manifest.folders,
      [folderId]: { ...folder, name: normalizedName },
    },
  };
}

export function moveAssetToFolder(
  manifest: AssetManifest,
  assetId: string,
  folderId: string | null,
): AssetManifest {
  const asset = manifest.assets[assetId];
  const normalizedFolderId = normalizeOptionalId(folderId) ?? null;
  if (
    !asset ||
    !isExistingFolder(manifest, normalizedFolderId) ||
    (asset.folderId ?? null) === normalizedFolderId
  ) {
    return manifest;
  }
  const order = nextAssetOrder(manifest, normalizedFolderId);
  return {
    ...manifest,
    assets: {
      ...manifest.assets,
      [assetId]: { ...asset, folderId: normalizedFolderId, order },
    },
  };
}

export function moveAssetFolder(
  manifest: AssetManifest,
  folderId: string,
  parentId: string | null,
): AssetManifest {
  const folder = manifest.folders?.[folderId];
  const normalizedParentId = normalizeOptionalId(parentId) ?? null;
  if (
    !folder ||
    !isExistingFolder(manifest, normalizedParentId) ||
    normalizedParentId === folderId ||
    folder.parentId === normalizedParentId ||
    isFolderDescendant(manifest, normalizedParentId, folderId) ||
    hasSiblingFolderName(
      manifest,
      normalizedParentId,
      folder.name,
      folder.id,
    )
  ) {
    return manifest;
  }
  return {
    ...manifest,
    folders: {
      ...manifest.folders,
      [folderId]: {
        ...folder,
        parentId: normalizedParentId,
        order: nextSiblingOrder(manifest, normalizedParentId),
      },
    },
  };
}

export function listAssetFolderChildren(
  manifest: AssetManifest,
  parentId: string | null,
): { folders: AssetFolder[]; assets: SceneAsset[] } {
  const normalizedParentId = normalizeOptionalId(parentId) ?? null;
  const compare = (left: { order?: number; name: string; id: string }, right: { order?: number; name: string; id: string }) =>
    (left.order ?? Number.MAX_SAFE_INTEGER) -
      (right.order ?? Number.MAX_SAFE_INTEGER) ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id);
  return {
    folders: Object.values(manifest.folders ?? {})
      .filter((folder) => folder.parentId === normalizedParentId)
      .sort(compare),
    assets: Object.values(manifest.assets)
      .filter(
        (asset) =>
          isUserLibraryAsset(asset) &&
          (asset.folderId ?? null) === normalizedParentId,
      )
      .sort(compare),
  };
}

export function reorderAssetsInFolder(
  manifest: AssetManifest,
  folderId: string | null,
  orderedAssetIds: string[],
): AssetManifest {
  const normalizedFolderId = normalizeOptionalId(folderId) ?? null;
  if (!isExistingFolder(manifest, normalizedFolderId)) return manifest;
  const siblings = Object.values(manifest.assets).filter(
    (asset) =>
      isUserLibraryAsset(asset) &&
      (asset.folderId ?? null) === normalizedFolderId,
  );
  if (!isExactIdSet(orderedAssetIds, siblings.map((asset) => asset.id))) {
    return manifest;
  }
  const assets = { ...manifest.assets };
  orderedAssetIds.forEach((assetId, order) => {
    assets[assetId] = { ...assets[assetId], order };
  });
  return { ...manifest, assets };
}

export function reorderAssetFolders(
  manifest: AssetManifest,
  parentId: string | null,
  orderedFolderIds: string[],
): AssetManifest {
  const normalizedParentId = normalizeOptionalId(parentId) ?? null;
  if (!isExistingFolder(manifest, normalizedParentId)) return manifest;
  const siblings = Object.values(manifest.folders ?? {}).filter(
    (folder) => folder.parentId === normalizedParentId,
  );
  if (!isExactIdSet(orderedFolderIds, siblings.map((folder) => folder.id))) {
    return manifest;
  }
  const folders = { ...(manifest.folders ?? {}) };
  orderedFolderIds.forEach((folderId, order) => {
    folders[folderId] = { ...folders[folderId], order };
  });
  return { ...manifest, folders };
}

function isExistingFolder(
  manifest: AssetManifest,
  folderId: string | null | undefined,
): boolean {
  return folderId === null || folderId === undefined || Boolean(manifest.folders?.[folderId]);
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  return normalized || null;
}

function hasSiblingFolderName(
  manifest: AssetManifest,
  parentId: string | null,
  name: string,
  exceptId?: string,
): boolean {
  const key = name.trim().toLocaleLowerCase();
  return Object.values(manifest.folders ?? {}).some(
    (folder) =>
      folder.id !== exceptId &&
      folder.parentId === parentId &&
      folder.name.trim().toLocaleLowerCase() === key,
  );
}

function nextSiblingOrder(
  manifest: AssetManifest,
  parentId: string | null,
): number {
  return (
    Math.max(
      -1,
      ...Object.values(manifest.folders ?? {})
        .filter((folder) => folder.parentId === parentId)
        .map((folder) => folder.order),
    ) + 1
  );
}

function nextAssetOrder(
  manifest: AssetManifest,
  folderId: string | null,
): number {
  return (
    Math.max(
      -1,
      ...Object.values(manifest.assets)
        .filter((asset) => (asset.folderId ?? null) === folderId)
        .map((asset) => asset.order ?? -1),
    ) + 1
  );
}

function isFolderDescendant(
  manifest: AssetManifest,
  candidateId: string | null,
  ancestorId: string,
): boolean {
  let currentId = candidateId;
  const visited = new Set<string>();
  while (currentId) {
    if (currentId === ancestorId) return true;
    if (visited.has(currentId)) return true;
    visited.add(currentId);
    currentId = manifest.folders?.[currentId]?.parentId ?? null;
  }
  return false;
}

function isExactIdSet(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    left.every((id) => right.includes(id))
  );
}

function normalizeTextureResize(
  value: TextureResizeSettings | undefined,
  fallback: TextureResizeSettings,
): TextureResizeSettings {
  if (!value) return { ...fallback, powerOfTwo: fallback.powerOfTwo === true };
  const powerOfTwo =
    typeof value.powerOfTwo === "boolean"
      ? value.powerOfTwo
      : fallback.powerOfTwo === true;
  if (value.mode === "original") return { mode: "original", powerOfTwo };
  return value.mode === "max-size" && isValidTextureMaxSize(value.maxSize)
    ? { mode: "max-size", maxSize: value.maxSize, powerOfTwo }
    : { ...fallback, powerOfTwo };
}

function hasOwn<ObjectType extends object>(
  object: ObjectType,
  key: PropertyKey,
): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneAssetThumbnail(
  thumbnail: AssetThumbnailDescriptor,
): AssetThumbnailDescriptor {
  return { ...thumbnail };
}
