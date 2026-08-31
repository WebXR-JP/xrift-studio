import type { SceneAsset } from "./asset-manifest";

/**
 * Single source of truth for file-format knowledge. Every extension, MIME type
 * and import-kind decision in the app derives from `ASSET_FORMATS` below.
 *
 * Adding a format is a one-line table edit; no importer, no panel and no
 * regular expression elsewhere may re-enumerate extensions.
 */

export type AssetFormatKind =
  | "texture"
  | "skybox"
  | "audio"
  | "font"
  | "shader"
  | "model"
  | "companion";

/** Kinds the import boundary can turn into an Asset. */
export type ImportableAssetFormatKind = Exclude<AssetFormatKind, "companion">;

export type AssetFormatDefinition = {
  /** Human readable format name for importer diagnostics and UI. */
  readonly label: string;
  /** Canonical MIME type written into the manifest. */
  readonly mimeType: string;
  /**
   * Extensions owned by this format; defaults to the table key. The first
   * entry is canonical and is used when a file name has to be rewritten.
   */
  readonly extensions?: readonly string[];
  /**
   * Accepted by scanners and companion matching but never classified into an
   * Asset, so legacy spellings do not become a new import path.
   */
  readonly legacyExtensions?: readonly string[];
  /** Extra MIME types accepted on input. */
  readonly altMimeTypes?: readonly string[];
  /** `false` keeps an ambiguous MIME type from resolving back to this format. */
  readonly resolveFromMimeType?: boolean;
  /** `false` keeps an ambiguous extension out of source-scanning patterns. */
  readonly scanInSource?: boolean;
  /** May accompany a model import as a sidecar file. */
  readonly companion?: boolean;
  /** Imported by the Studio model pipeline without format conversion. */
  readonly nativeModel?: boolean;
};

type AssetFormatTable = Readonly<Record<string, AssetFormatDefinition>>;

/**
 * Declaration order is resolution priority: `.svg` resolves to the Texture
 * format because `texture` is declared before `model`.
 */
export const ASSET_FORMATS = {
  texture: {
    png: {
      label: "PNG",
      mimeType: "image/png",
      extensions: ["png"],
      companion: true,
    },
    jpeg: {
      label: "JPEG",
      mimeType: "image/jpeg",
      extensions: ["jpg", "jpeg"],
      companion: true,
    },
    webp: {
      label: "WebP",
      mimeType: "image/webp",
      extensions: ["webp"],
      companion: true,
    },
    avif: {
      label: "AVIF",
      mimeType: "image/avif",
      extensions: ["avif"],
      companion: true,
    },
    gif: {
      label: "GIF",
      mimeType: "image/gif",
      extensions: ["gif"],
      companion: true,
    },
    bmp: {
      label: "BMP",
      mimeType: "image/bmp",
      extensions: ["bmp"],
      companion: true,
    },
    svg: {
      label: "SVG",
      mimeType: "image/svg+xml",
      extensions: ["svg"],
      companion: true,
    },
    ktx2: {
      label: "KTX2",
      mimeType: "image/ktx2",
      extensions: ["ktx2"],
      // `.ktx` (v1) is still referenced by Classic projects but is not an
      // import target, so it stays out of `classifyAssetImport`.
      legacyExtensions: ["ktx"],
      altMimeTypes: ["image/ktx"],
      companion: true,
    },
  },
  skybox: {
    hdr: {
      label: "Radiance HDR",
      mimeType: "image/vnd.radiance",
      extensions: ["hdr"],
      altMimeTypes: ["image/x-hdr"],
      companion: true,
    },
    exr: {
      label: "OpenEXR",
      mimeType: "image/x-exr",
      extensions: ["exr"],
      companion: true,
    },
  },
  audio: {
    mp3: {
      label: "MP3",
      mimeType: "audio/mpeg",
      extensions: ["mp3"],
      altMimeTypes: ["audio/mp3"],
    },
    wav: {
      label: "WAV",
      mimeType: "audio/wav",
      extensions: ["wav"],
      altMimeTypes: ["audio/x-wav", "audio/wave"],
    },
    ogg: {
      label: "Ogg Vorbis",
      mimeType: "audio/ogg",
      extensions: ["ogg", "oga", "opus"],
      altMimeTypes: ["audio/x-ogg", "application/ogg", "audio/vorbis", "audio/opus"],
    },
    flac: {
      label: "FLAC",
      mimeType: "audio/flac",
      extensions: ["flac"],
      altMimeTypes: ["audio/x-flac"],
    },
    m4a: {
      label: "AAC (M4A)",
      mimeType: "audio/mp4",
      extensions: ["m4a", "aac"],
      altMimeTypes: ["audio/aac", "audio/x-m4a", "audio/mp4a-latm"],
    },
    webm: {
      label: "WebM Audio",
      mimeType: "audio/webm",
      extensions: ["weba"],
      altMimeTypes: ["audio/x-webm"],
    },
  },
  font: {
    // troika parses TrueType, OpenType and WOFF 1.0 and rejects WOFF2, so a
    // WOFF2 file is deliberately absent: importing one would produce a Text
    // that never typesets rather than one that falls back.
    ttf: {
      label: "TrueType",
      mimeType: "font/ttf",
      extensions: ["ttf"],
      altMimeTypes: ["application/x-font-ttf", "application/font-sfnt"],
    },
    otf: {
      label: "OpenType",
      mimeType: "font/otf",
      extensions: ["otf"],
      altMimeTypes: ["application/x-font-otf"],
    },
    woff: {
      label: "WOFF",
      mimeType: "font/woff",
      extensions: ["woff"],
      altMimeTypes: ["application/font-woff"],
    },
  },
  shader: {
    glsl: {
      label: "GLSL",
      mimeType: "text/x-glsl",
      extensions: ["glsl"],
    },
    vertex: {
      label: "GLSL vertex shader",
      mimeType: "text/x-glsl",
      extensions: ["vert", "vertex", "vs"],
      resolveFromMimeType: false,
    },
    fragment: {
      label: "GLSL fragment shader",
      mimeType: "text/x-glsl",
      extensions: ["frag", "fragment", "fs"],
      resolveFromMimeType: false,
    },
  },
  model: {
    "3dm": { label: "Rhino 3DM", mimeType: "model/3dm" },
    "3ds": { label: "3D Studio", mimeType: "model/3ds" },
    "3mf": { label: "3D Manufacturing Format", mimeType: "model/3mf" },
    amf: { label: "Additive Manufacturing Format", mimeType: "model/amf" },
    dae: { label: "COLLADA", mimeType: "model/dae" },
    drc: { label: "Draco geometry", mimeType: "model/drc" },
    fbx: { label: "Autodesk FBX", mimeType: "model/fbx" },
    glb: {
      label: "glTF Binary",
      mimeType: "model/gltf-binary",
      nativeModel: true,
    },
    gltf: {
      label: "glTF JSON",
      mimeType: "model/gltf+json",
      nativeModel: true,
    },
    json: {
      label: "Three.js JSON",
      mimeType: "model/json",
      // `.json` is far too common in source trees to treat every string
      // literal ending in it as a model reference.
      scanInSource: false,
      resolveFromMimeType: false,
    },
    kmz: { label: "KMZ / COLLADA", mimeType: "model/kmz" },
    ldr: { label: "LDraw", mimeType: "model/ldr", companion: true },
    md2: { label: "Quake II MD2", mimeType: "model/md2" },
    mpd: { label: "LDraw MPD", mimeType: "model/mpd", companion: true },
    obj: {
      label: "Wavefront OBJ",
      mimeType: "model/obj",
      altMimeTypes: ["text/obj"],
      nativeModel: true,
    },
    pcd: { label: "Point Cloud Data", mimeType: "model/pcd" },
    ply: { label: "Polygon File Format", mimeType: "model/ply" },
    stl: { label: "STL", mimeType: "model/stl" },
    svg: {
      label: "SVG geometry",
      mimeType: "image/svg+xml",
      // The Texture format owns `image/svg+xml`; SVG only becomes a model
      // when the caller explicitly asks for it.
      resolveFromMimeType: false,
    },
    usd: { label: "Universal Scene Description", mimeType: "model/usd" },
    usda: {
      label: "Universal Scene Description ASCII",
      mimeType: "model/usda",
    },
    usdc: {
      label: "Universal Scene Description Crate",
      mimeType: "model/usdc",
    },
    usdz: { label: "Universal Scene Description ZIP", mimeType: "model/usdz" },
    vox: { label: "MagicaVoxel VOX", mimeType: "model/vox" },
    vrm: { label: "VRM", mimeType: "model/vrm", nativeModel: true },
    wrl: { label: "VRML", mimeType: "model/wrl" },
    xyz: { label: "XYZ point cloud", mimeType: "model/xyz" },
  },
  companion: {
    bin: { label: "glTF buffer", mimeType: "application/octet-stream", companion: true },
    mtl: { label: "Wavefront MTL", mimeType: "model/mtl", companion: true },
    tga: { label: "Targa", mimeType: "image/x-tga", companion: true },
    tiff: {
      label: "TIFF",
      mimeType: "image/tiff",
      extensions: ["tif", "tiff"],
      companion: true,
    },
    dds: { label: "DirectDraw Surface", mimeType: "image/vnd-ms.dds", companion: true },
    dat: { label: "LDraw part", mimeType: "application/octet-stream", companion: true },
  },
} as const satisfies Readonly<Record<AssetFormatKind, AssetFormatTable>>;

/** Project package files handled by a dedicated importer, not by format. */
export const PROJECT_PACKAGE_EXTENSIONS = [
  "unitypackage",
  "unity",
  "prefab",
] as const;

/* ------------------------------------------------------------------ */
/* Legacy public API, now derived                                      */
/* ------------------------------------------------------------------ */

export type ThreeEditorModelFormat = keyof typeof ASSET_FORMATS.model;
export type StudioImageFormat = keyof typeof ASSET_FORMATS.texture;
export type SkyboxFormat = keyof typeof ASSET_FORMATS.skybox;
export type AudioFormat = keyof typeof ASSET_FORMATS.audio;
export type FontFormat = keyof typeof ASSET_FORMATS.font;

/** Preserved shape: `{ [extension]: label }`. */
export const THREE_EDITOR_MODEL_FORMATS = Object.fromEntries(
  Object.entries(ASSET_FORMATS.model).map(([id, definition]) => [
    id,
    definition.label,
  ]),
) as Record<ThreeEditorModelFormat, string>;

/** Preserved shape: `{ [format]: { mimeType, extensions } }` (now with `label`). */
export const STUDIO_IMAGE_FORMATS = ASSET_FORMATS.texture;

export const STUDIO_NATIVE_MODEL_FORMATS = Object.entries(ASSET_FORMATS.model)
  .filter(
    ([, definition]) =>
      (definition as AssetFormatDefinition).nativeModel === true,
  )
  .map(([id]) => id) as ReadonlyArray<ThreeEditorModelFormat> as readonly [
  "glb",
  "gltf",
  "obj",
  "vrm",
];/* ------------------------------------------------------------------ */
/* Indices                                                             */
/* ------------------------------------------------------------------ */

export type ResolvedAssetFormat = {
  readonly kind: AssetFormatKind;
  readonly id: string;
  readonly definition: AssetFormatDefinition;
};

function canonicalExtensionsOf(
  kind: AssetFormatKind,
  id: string,
): readonly string[] {
  const definition = (ASSET_FORMATS[kind] as AssetFormatTable)[id];
  return definition.extensions ?? [id];
}

const ALL_FORMATS: readonly ResolvedAssetFormat[] = (
  Object.entries(ASSET_FORMATS) as Array<[AssetFormatKind, AssetFormatTable]>
).flatMap(([kind, table]) =>
  Object.entries(table).map(([id, definition]) => ({ kind, id, definition })),
);

/** Canonical extensions only; legacy spellings never classify. */
const FORMAT_BY_EXTENSION = new Map<string, ResolvedAssetFormat>();
const FORMAT_BY_KIND_EXTENSION = new Map<string, ResolvedAssetFormat>();
const FORMAT_BY_MIME_TYPE = new Map<string, ResolvedAssetFormat>();

for (const entry of ALL_FORMATS) {
  for (const extension of canonicalExtensionsOf(entry.kind, entry.id)) {
    if (!FORMAT_BY_EXTENSION.has(extension)) {
      FORMAT_BY_EXTENSION.set(extension, entry);
    }
    const scoped = `${entry.kind}:${extension}`;
    if (!FORMAT_BY_KIND_EXTENSION.has(scoped)) {
      FORMAT_BY_KIND_EXTENSION.set(scoped, entry);
    }
  }
  if (entry.definition.resolveFromMimeType === false) continue;
  for (const mimeType of [
    entry.definition.mimeType,
    ...(entry.definition.altMimeTypes ?? []),
  ]) {
    if (!FORMAT_BY_MIME_TYPE.has(mimeType)) {
      FORMAT_BY_MIME_TYPE.set(mimeType, entry);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export function extensionOfPath(path: string): string {
  const leaf = path.split(/[\\/]/).pop() ?? path;
  const withoutQuery = leaf.replace(/[?#].*$/, "");
  const index = withoutQuery.lastIndexOf(".");
  return index >= 0 ? withoutQuery.slice(index + 1).toLowerCase() : "";
}

export type FormatLookupOptions = {
  /** Resolves the `.svg` ambiguity towards the model importer. */
  readonly preferModel?: boolean;
};

export function formatForPath(
  path: string,
  options: FormatLookupOptions = {},
): ResolvedAssetFormat | undefined {
  const extension = extensionOfPath(path);
  if (!extension) return undefined;
  if (options.preferModel) {
    const model = FORMAT_BY_KIND_EXTENSION.get(`model:${extension}`);
    if (model) return model;
  }
  return FORMAT_BY_EXTENSION.get(extension);
}

export function formatForExtension(
  kind: AssetFormatKind,
  extension: string,
): ResolvedAssetFormat | undefined {
  return FORMAT_BY_KIND_EXTENSION.get(`${kind}:${extension.toLowerCase()}`);
}

export function formatForMimeType(
  mimeType: string,
): ResolvedAssetFormat | undefined {
  return FORMAT_BY_MIME_TYPE.get(mimeType.trim().toLowerCase().split(";")[0]);
}

/** The import kind a file path belongs to, or `undefined` when unsupported. */
export function kindForPath(
  path: string,
  options: FormatLookupOptions = {},
): AssetFormatKind | undefined {
  return formatForPath(path, options)?.kind;
}

/** Canonical MIME type for a path; the generic binary type when unknown. */
export function mimeTypeForPath(path: string): string {
  return formatForPath(path)?.definition.mimeType ?? "application/octet-stream";
}

export function isThreeEditorModelFormat(
  value: string,
): value is ThreeEditorModelFormat {
  return Object.prototype.hasOwnProperty.call(ASSET_FORMATS.model, value);
}

export function isStudioNativeModelFormat(
  format: string,
): format is (typeof STUDIO_NATIVE_MODEL_FORMATS)[number] {
  return (
    isThreeEditorModelFormat(format) &&
    (ASSET_FORMATS.model[format] as AssetFormatDefinition).nativeModel === true
  );
}

export function studioImageFormatForExtension(
  extension: string,
): StudioImageFormat | undefined {
  const entry = formatForExtension("texture", extension);
  return entry?.id as StudioImageFormat | undefined;
}

export function studioImageFormatForMimeType(
  mimeType: string,
): StudioImageFormat | undefined {
  const entry = formatForMimeType(mimeType);
  return entry?.kind === "texture"
    ? (entry.id as StudioImageFormat)
    : undefined;
}

export function modelFormatForSource(
  extension: string,
  mimeType: string,
): ThreeEditorModelFormat | undefined {
  if (isThreeEditorModelFormat(extension)) return extension;
  const entry = formatForMimeType(mimeType);
  return entry?.kind === "model"
    ? (entry.id as ThreeEditorModelFormat)
    : undefined;
}

export function modelMimeType(format: ThreeEditorModelFormat): string {
  return ASSET_FORMATS.model[format].mimeType;
}

/** Texture Asset `sourceFormat` ids: image formats plus the HDRI formats. */
export const TEXTURE_SOURCE_FORMAT_IDS = [
  ...Object.keys(ASSET_FORMATS.texture),
  ...Object.keys(ASSET_FORMATS.skybox),
] as ReadonlyArray<StudioImageFormat | SkyboxFormat>;

export function textureSourceFormatForExtension(
  extension: string,
): StudioImageFormat | SkyboxFormat | undefined {
  const entry =
    formatForExtension("texture", extension) ??
    formatForExtension("skybox", extension);
  return entry?.id as StudioImageFormat | SkyboxFormat | undefined;
}

/* ------------------------------------------------------------------ */
/* Extension sets and patterns                                         */
/* ------------------------------------------------------------------ */

export type ExtensionSetOptions = {
  /** Include legacy spellings such as `.ktx`. Defaults to `true`. */
  readonly includeLegacy?: boolean;
  /** Skip formats flagged `scanInSource: false`. Defaults to `false`. */
  readonly scannableOnly?: boolean;
};

export function extensionsForKinds(
  kinds: readonly AssetFormatKind[],
  options: ExtensionSetOptions = {},
): readonly string[] {
  const includeLegacy = options.includeLegacy ?? true;
  const wanted = new Set(kinds);
  const result: string[] = [];
  for (const entry of ALL_FORMATS) {
    if (!wanted.has(entry.kind)) continue;
    if (options.scannableOnly && entry.definition.scanInSource === false) {
      continue;
    }
    for (const extension of [
      ...canonicalExtensionsOf(entry.kind, entry.id),
      ...(includeLegacy ? entry.definition.legacyExtensions ?? [] : []),
    ]) {
      if (!result.includes(extension)) result.push(extension);
    }
  }
  return result;
}

/** Extensions that may accompany a model import as a sidecar. */
export const MODEL_COMPANION_EXTENSIONS: readonly string[] = (() => {
  const result: string[] = [];
  for (const entry of ALL_FORMATS) {
    if (entry.definition.companion !== true) continue;
    for (const extension of [
      ...canonicalExtensionsOf(entry.kind, entry.id),
      ...(entry.definition.legacyExtensions ?? []),
    ]) {
      if (!result.includes(extension)) result.push(extension);
    }
  }
  return result;
})();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function alternationOf(extensions: readonly string[]): string {
  return extensions.map(escapeRegExp).join("|");
}

/** `/\.(?:ext|ext)(?:[?#].*)?$/i` — safe to share, carries no `lastIndex`. */
export function extensionPattern(extensions: readonly string[]): RegExp {
  return new RegExp(`\\.(?:${alternationOf(extensions)})(?:[?#].*)?$`, "i");
}

export function extensionPatternForKinds(
  kinds: readonly AssetFormatKind[],
  options?: ExtensionSetOptions,
): RegExp {
  return extensionPattern(extensionsForKinds(kinds, options));
}

/**
 * Matches a quoted asset path inside source code. Returns a fresh `RegExp`
 * because the global flag makes `lastIndex` stateful.
 */
export function createQuotedReferenceScanPattern(
  kinds: readonly AssetFormatKind[],
): RegExp {
  const alternation = alternationOf(
    extensionsForKinds(kinds, { scannableOnly: true }),
  );
  return new RegExp(
    `["'\`]([^"'\`\\r\\n]*?\\.(?:${alternation})(?:[?#][^"'\`\\r\\n]*)?)["'\`]`,
    "gi",
  );
}

/** Matches an asset path embedded in a larger expression or template. */
export function createEmbeddedReferencePattern(
  kinds: readonly AssetFormatKind[],
): RegExp {
  const alternation = alternationOf(
    extensionsForKinds(kinds, { scannableOnly: true }),
  );
  return new RegExp(
    `([^\${}\\s"'\`]+\\.(?:${alternation})(?:[?#][^\\s"'\`]*)?)`,
    "i",
  );
}

export const MODEL_EXTENSION_PATTERN = extensionPatternForKinds(["model"]);
/** @deprecated Use `MODEL_EXTENSION_PATTERN`. */
export const THREE_EDITOR_MODEL_EXTENSION_PATTERN = MODEL_EXTENSION_PATTERN;

export const NATIVE_MODEL_EXTENSION_PATTERN = extensionPattern(
  STUDIO_NATIVE_MODEL_FORMATS,
);

export const IMAGE_EXTENSION_PATTERN = extensionPatternForKinds(["texture"]);
/** @deprecated Use `IMAGE_EXTENSION_PATTERN`. */
export const STUDIO_IMAGE_EXTENSION_PATTERN = IMAGE_EXTENSION_PATTERN;

export const SKYBOX_EXTENSION_PATTERN = extensionPatternForKinds(["skybox"]);
export const AUDIO_EXTENSION_PATTERN = extensionPatternForKinds(["audio"]);
export const SHADER_EXTENSION_PATTERN = extensionPatternForKinds(["shader"]);

/** Image formats plus HDRI, i.e. everything that becomes a Texture Asset. */
export const TEXTURE_LIKE_EXTENSION_PATTERN = extensionPatternForKinds([
  "texture",
  "skybox",
]);

export const MODEL_COMPANION_EXTENSION_PATTERN = extensionPattern(
  MODEL_COMPANION_EXTENSIONS,
);

export const PROJECT_PACKAGE_EXTENSION_PATTERN = extensionPattern(
  PROJECT_PACKAGE_EXTENSIONS,
);

/** Everything the drag-and-drop / file-picker boundary accepts. */
export const SUPPORTED_IMPORT_EXTENSION_PATTERN = extensionPattern([
  ...PROJECT_PACKAGE_EXTENSIONS,
  ...extensionsForKinds(["texture", "skybox", "audio", "shader", "model"], {
    includeLegacy: false,
  }),
]);

export const ASSET_IMPORT_ACCEPT = [
  ...PROJECT_PACKAGE_EXTENSIONS.map((extension) => `.${extension}`),
  ...extensionsForKinds(["model", "texture", "skybox", "audio", "font", "shader"], {
    includeLegacy: false,
  }).map((extension) => `.${extension}`),
  ...[
    ...new Set(
      ALL_FORMATS.filter(
        (entry) => entry.kind !== "companion" && entry.kind !== "shader",
      ).flatMap((entry) => [
        entry.definition.mimeType,
        ...(entry.definition.altMimeTypes ?? []),
      ]),
    ),
  ],
].join(",");

/* ------------------------------------------------------------------ */
/* Asset kind presentation                                             */
/* ------------------------------------------------------------------ */

/**
 * Icon names must exist in `EDITOR_ICONS`; `editor-icons.tsx` asserts this at
 * compile time so this table can stay in `lib/` without importing components.
 */
export type AssetKindIconName =
  | "model"
  | "material"
  | "texture"
  | "particle"
  | "asset"
  | "audio"
  | "font"
  | "script"
  | "prefab"
  | "primitive";

export type AssetKindPresentation = {
  readonly icon: AssetKindIconName;
  readonly label: string;
};

export const ASSET_KIND_UI = {
  primitive: { icon: "primitive", label: "Primitive" },
  model: { icon: "model", label: "Model" },
  material: { icon: "material", label: "Material" },
  texture: { icon: "texture", label: "Texture" },
  skybox: { icon: "texture", label: "Texture / HDRI" },
  particle: { icon: "particle", label: "Particle" },
  interactivity: { icon: "asset", label: "KHR Interactivity" },
  audio: { icon: "audio", label: "Audio" },
  font: { icon: "font", label: "Font" },
  script: { icon: "script", label: "Script" },
  shader: { icon: "script", label: "GLSL Shader" },
  template: { icon: "prefab", label: "Prefab" },
} as const satisfies Readonly<
  Record<SceneAsset["kind"], AssetKindPresentation>
>;
