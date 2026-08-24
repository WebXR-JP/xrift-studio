# レジストリ統合の作業仕様 (2026-08-09)

2026-08-09 時点の記録である。行番号とファイル構成は当時のものであり、その後の変更を反映していない。[コード品質監査レポート](./refactoring-audit-2026-08.md) の指摘に加え、`VisualEditorPrototype.tsx` と `SceneViewport.tsx` の重複2箇所、`serialization.ts` の validator 群を対象へ含めている。

---

## Task A — asset-format-registry を単一の真実にする

## A-0. 現状の実測（live repo）

| # | 場所 | 現在の知識 |
|---|---|---|
| 1 | `component-code-import.ts` L598 `scanModuleAssetReferences` | `glb\|gltf\|obj\|vrm\|png\|jpe?g\|webp\|ktx2\|hdr\|exr\|drc` |
| 2 | `component-code-import.ts` L614 `resolveAssetReference` | 同上 + L619–622 で registry pattern と `hdr\|exr` を再チェック |
| 3 | `component-code-import.ts` L553–566 `importedAssetKind` | registry pattern + `hdr\|exr` 手書き |
| 4 | `classic-project-import.ts` L159 `MODEL_COMPANION_PATTERN` | `bin\|mtl\|png\|jpe?g\|webp\|avif\|gif\|bmp\|svg\|tga\|tif\|tiff\|dds\|ktx2?\|hdr\|exr\|dat\|ldr\|mpd` |
| 5 | `classic-project-import.ts` L1422 | `png\|jpe?g\|webp\|avif\|gif\|bmp\|svg\|ktx2?\|hdr\|exr` |
| 6 | `classic-project-import.ts` L1656 `scanClassicModuleResources` | 上記 + `glb\|gltf\|obj\|vrm\|drc\|mp3\|wav` |
| 7 | `classic-project-import.ts` L1705 `classicResourceKind` | 3本の regex |
| 8 | `unity-package-import.ts` L112 `SUPPORTED_PACKAGE_ASSET` | `glb\|gltf\|obj\|vrm\|png\|jpe?g\|webp\|ktx2\|hdr\|exr`（**avif/gif/bmp/svg 欠落**） |
| 9 | `unity-package-import.ts` L1398 `mimeTypeForPath` | 11分岐 switch |
| 10 | `asset-manifest.ts` L690 `getTextureSourceFormat` | 拡張子配列リテラル |
| 11 | `asset-import.ts` L318–348 | `modelFormatFromSource` / `modelMimeType` / `studioImageFormatFromMimeType` |
| 12 | **（未指摘）** `VisualEditorPrototype.tsx` L291–296 | `SUPPORTED_HDRI_FILE` / `SUPPORTED_AUDIO_FILE` / `SUPPORTED_SHADER_FILE` / `SUPPORTED_UNITY_FILE` |
| 13 | **（未指摘）** `SceneViewport.tsx` L2350 | `/\.(?:glb\|gltf\|obj\|vrm)$/i`（= `STUDIO_NATIVE_MODEL_FORMATS` の手書きコピー） |
| 14 | UI | `AssetsPanel.tsx` L109/135（label/icon switch）、`AssetQuickEditor.tsx` L380–400（fallback icon/label）、L605–612 |

`InspectorPanel.tsx` / `HierarchyPanel.tsx` のアイコン switch は **entity component 基準**であり asset.kind 基準ではないため、Task A の対象外です（Phase 3 の component registry 側の話）。監査の「UI switch 6箇所」は実測では **asset.kind 基準は3箇所**（AssetsPanel×2、AssetQuickEditor×2）でした。

---

## A-1. 新 `src/lib/visual-editor/asset-format-registry.ts`（全文置換）

```ts
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
  .filter(([, definition]) => definition.nativeModel === true)
  .map(([id]) => id) as ReadonlyArray<ThreeEditorModelFormat> as readonly [
  "glb",
  "gltf",
  "obj",
  "vrm",
];

/* ------------------------------------------------------------------ */
/* Indices                                                             */
/* ------------------------------------------------------------------ */

export type ResolvedAssetFormat = {
  readonly kind: AssetFormatKind;
  readonly id: string;
  readonly definition: AssetFormatDefinition;
};

function canonicalExtensionsOf(kind: AssetFormatKind, id: string): readonly string[] {
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
    ASSET_FORMATS.model[format].nativeModel === true
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
  ...extensionsForKinds(["model", "texture", "skybox", "audio", "shader"], {
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
  script: { icon: "script", label: "Script" },
  shader: { icon: "script", label: "GLSL Shader" },
  template: { icon: "prefab", label: "Prefab" },
} as const satisfies Readonly<
  Record<SceneAsset["kind"], AssetKindPresentation>
>;
```

### 追加する compile-time assertion（`src/components/visual-editor/editor-icons.tsx` 末尾）

```ts
import type { AssetKindIconName } from "../../lib/visual-editor/asset-format-registry";

// Keeps ASSET_KIND_UI honest without inverting the lib -> components dependency.
type AssetKindIconsExist = AssetKindIconName extends EditorIconName ? true : never;
const ASSET_KIND_ICONS_EXIST: AssetKindIconsExist = true;
void ASSET_KIND_ICONS_EXIST;
```

### 既存 export の挙動変化まとめ

| export | 変化 |
|---|---|
| `THREE_EDITOR_MODEL_FORMATS` | `as const` リテラル → `Record<ThreeEditorModelFormat, string>`。値・キーは同一。**リポジトリ内に外部利用者ゼロ**（grep 済）なので影響なし |
| `STUDIO_IMAGE_FORMATS` | 各エントリに `label` フィールドが増える。`mimeType` / `extensions` は同一 |
| `STUDIO_NATIVE_MODEL_FORMATS` | 型が `readonly ["glb","gltf","obj","vrm"]` に。値同一 |
| `THREE_EDITOR_MODEL_EXTENSION_PATTERN` | 同一（`MODEL_EXTENSION_PATTERN` の別名） |
| `STUDIO_IMAGE_EXTENSION_PATTERN` | 同一（`IMAGE_EXTENSION_PATTERN` の別名） |
| `ASSET_IMPORT_ACCEPT` | 項目の**順序が変わり、`image/ktx2` / `model/3ds` 等の MIME が増える**。`accept` 属性なので機能的影響なし |
| `isThreeEditorModelFormat` / `studioImageFormatForExtension` | 挙動同一 |

---

## A-2. 呼び出し箇所ごとの差し替え

### (1) `component-code-import.ts` L42–44（import）

現在:
```ts
import {
  STUDIO_IMAGE_EXTENSION_PATTERN,
  THREE_EDITOR_MODEL_EXTENSION_PATTERN,
} from "./asset-format-registry";
```
置換:
```ts
import {
  createEmbeddedReferencePattern,
  createQuotedReferenceScanPattern,
  kindForPath,
  MODEL_EXTENSION_PATTERN,
} from "./asset-format-registry";

/** Kinds a JSX component module can reference. */
const COMPONENT_CODE_REFERENCE_KINDS = ["texture", "skybox", "model"] as const;
```
挙動変化: なし（定義のみ）。

---

### (2) `component-code-import.ts` L553–566 `importedAssetKind`

現在:
```ts
function importedAssetKind(
  sourcePath: string,
  preferredKind?: "model" | "texture",
): ComponentCodeImportAssetDependency["kind"] {
  if (
    preferredKind === "model" &&
    THREE_EDITOR_MODEL_EXTENSION_PATTERN.test(sourcePath)
  ) {
    return "model";
  }
  if (STUDIO_IMAGE_EXTENSION_PATTERN.test(sourcePath)) return "texture";
  if (THREE_EDITOR_MODEL_EXTENSION_PATTERN.test(sourcePath)) return "model";
  if (/\.(?:hdr|exr)$/i.test(sourcePath)) return "texture";
  return "unsupported";
}
```
置換:
```ts
function importedAssetKind(
  sourcePath: string,
  preferredKind?: "model" | "texture",
): ComponentCodeImportAssetDependency["kind"] {
  const kind = kindForPath(sourcePath, {
    preferModel: preferredKind === "model",
  });
  if (kind === "model") return "model";
  // HDRI still becomes a Texture Asset on this import path.
  if (kind === "texture" || kind === "skybox") return "texture";
  return "unsupported";
}
```
挙動変化: **あり（意図的）**。従来 `preferredKind === "model"` は model 拡張子のときだけ model を返し、それ以外は image を優先していた。新実装も同一（`preferModel` は `.svg` の解決のみに効き、image 専用拡張子は model index に無いのでヒットしない）。実質的な差は `.mp3` / `.wav` が従来通り `unsupported` である点も含め同じ。**差分なし**（意味論を保ったままの表現置換）。

---

### (3) `component-code-import.ts` L598 `scanModuleAssetReferences`

現在:
```ts
  const stringPattern = /["'`]([^"'`\r\n]*?\.(?:glb|gltf|obj|vrm|png|jpe?g|webp|ktx2|hdr|exr|drc)(?:[?#][^"'`\r\n]*)?)["'`]/gi;
```
置換:
```ts
  const stringPattern = createQuotedReferenceScanPattern(
    COMPONENT_CODE_REFERENCE_KINDS,
  );
```
挙動変化: **あり（意図的・修正の本体）**。新たに `avif` / `gif` / `bmp` / `svg` / `ktx`（legacy）と、three.js Editor 対応の残り 21 モデル形式（`3dm 3ds 3mf amf dae fbx kmz ldr md2 mpd pcd ply stl usd usda usdc usdz vox wrl xyz`）を検出。`json` は `scanInSource: false` により従来通り**非検出**。検出後の分類は同ファイル L553 の `importedAssetKind` が既に全27形式を model と判定していたため、下流は無変更で整合。

---

### (4) `component-code-import.ts` L611–623 `resolveAssetReference`

現在:
```ts
  const embedded = candidate.match(
    /([^${}\s"'`]+\.(?:glb|gltf|obj|vrm|png|jpe?g|webp|ktx2|hdr|exr|drc)(?:[?#][^\s"'`]*)?)/i,
  );
  if (!embedded) return undefined;
  candidate = embedded[1].replace(/[?#].*$/, "").replace(/\\/g, "/");
  if (
    !THREE_EDITOR_MODEL_EXTENSION_PATTERN.test(candidate) &&
    !STUDIO_IMAGE_EXTENSION_PATTERN.test(candidate) &&
    !/\.(?:hdr|exr)(?:[?#].*)?$/i.test(candidate)
  ) {
    return undefined;
  }
```
置換:
```ts
  const embedded = candidate.match(
    createEmbeddedReferencePattern(COMPONENT_CODE_REFERENCE_KINDS),
  );
  if (!embedded) return undefined;
  candidate = embedded[1].replace(/[?#].*$/, "").replace(/\\/g, "/");
  if (kindForPath(candidate) === undefined) return undefined;
```
挙動変化: **あり（意図的）**。(3) と同じ集合の拡大。加えて第2チェックが `kindForPath` になることで `.mp3` / `.wav` / `.glsl` も **通過するようになる** — ここは望ましくないため、正確に保つなら:
```ts
  const kind = kindForPath(candidate);
  if (kind !== "model" && kind !== "texture" && kind !== "skybox") return undefined;
```
**こちらを採用**（上のワンライナーではなく）。これで audio/shader は従来通り除外される。

---

### (5) `classic-project-import.ts` L156–160

現在:
```ts
const SOURCE_MODULE_PATTERN = /\.(?:[cm]?[jt]sx?)$/i;
const MAX_COMPANION_FILES = 512;
const MAX_COMPANION_BYTES = 128 * 1024 * 1024;
const MODEL_COMPANION_PATTERN =
  /\.(?:bin|mtl|png|jpe?g|webp|avif|gif|bmp|svg|tga|tif|tiff|dds|ktx2?|hdr|exr|dat|ldr|mpd)$/i;
```
置換:
```ts
const SOURCE_MODULE_PATTERN = /\.(?:[cm]?[jt]sx?)$/i;
const MAX_COMPANION_FILES = 512;
const MAX_COMPANION_BYTES = 128 * 1024 * 1024;
/** Kinds a Classic project module can reference. */
const CLASSIC_REFERENCE_KINDS = [
  "texture",
  "skybox",
  "audio",
  "model",
] as const;
```
（`MODEL_COMPANION_PATTERN` は registry の `MODEL_COMPANION_EXTENSION_PATTERN` を import して使用。）

import 行に追加:
```ts
import {
  createQuotedReferenceScanPattern,
  kindForPath,
  MODEL_COMPANION_EXTENSION_PATTERN,
  TEXTURE_LIKE_EXTENSION_PATTERN,
} from "./asset-format-registry";
```

L1913 の使用箇所:
```ts
      if (rel === normalizedSource || !MODEL_COMPANION_PATTERN.test(rel)) continue;
```
→
```ts
      if (rel === normalizedSource || !MODEL_COMPANION_EXTENSION_PATTERN.test(rel)) continue;
```
挙動変化: **なし**。導出集合は `bin mtl png jpg jpeg webp avif gif bmp svg ktx2 ktx hdr exr tga tif tiff dds dat ldr mpd` で、現行 regex と完全一致（`ktx2?` = `ktx2|ktx`）。唯一の差は末尾が `(?:[?#].*)?$` になり `?`/`#` 付きパスも許容する点（zip 内の相対パスに対しては無害）。

---

### (6) `classic-project-import.ts` L1418–1424（texture uniform 走査）

現在:
```ts
    const paths = [...match[2].matchAll(
      /["'`]([^"'`\r\n]*?\.(?:png|jpe?g|webp|avif|gif|bmp|svg|ktx2?|hdr|exr))["'`]/gi,
    )]
```
置換:
```ts
    const paths = [...match[2].matchAll(
      createQuotedReferenceScanPattern(["texture", "skybox"]),
    )]
```
挙動変化: **なし**（同集合）。クエリ文字列付きパス `"tex.png?v=2"` も拾えるようになる点のみ拡大。

---

### (7) `classic-project-import.ts` L1651–1668 `scanClassicModuleResources`

現在:
```ts
  const pattern =
    /["'`]([^"'`\r\n]*?\.(?:glb|gltf|obj|vrm|png|jpe?g|webp|avif|gif|bmp|svg|ktx2|hdr|exr|drc|mp3|wav)(?:[?#][^"'`\r\n]*)?)["'`]/gi;
```
置換:
```ts
  const pattern = createQuotedReferenceScanPattern(CLASSIC_REFERENCE_KINDS);
```
挙動変化: **あり（意図的）**。`3dm 3ds 3mf amf dae fbx kmz ldr md2 mpd pcd ply stl usd usda usdc usdz vox wrl xyz` と `ktx` が新たに検出対象。`json` は除外のまま。

---

### (8) `classic-project-import.ts` L1705–1714 `classicResourceKind`

現在:
```ts
function classicResourceKind(
  sourcePath: string,
): ClassicProjectVisualResource["kind"] {
  if (/\.(?:glb|gltf|obj|vrm|drc)$/i.test(sourcePath)) return "model";
  if (/\.(?:png|jpe?g|webp|avif|gif|bmp|svg|ktx2|hdr|exr)$/i.test(sourcePath)) {
    return "texture";
  }
  if (/\.(?:mp3|wav)$/i.test(sourcePath)) return "audio";
  return "unsupported";
}
```
置換:
```ts
function classicResourceKind(
  sourcePath: string,
): ClassicProjectVisualResource["kind"] {
  const kind = kindForPath(sourcePath);
  if (kind === "model") return "model";
  // HDRI is stored as a Texture Asset by the Classic importer.
  if (kind === "texture" || kind === "skybox") return "texture";
  if (kind === "audio") return "audio";
  return "unsupported";
}
```
挙動変化: **あり（意図的）**。従来 `.svg` は「model 判定 → 該当せず → texture」の順で texture になっていたが、registry も texture 優先なので同一。新規に model と判定される 21 形式が `"unsupported"` から `"model"` へ。

---

### (9) `unity-package-import.ts` L112

現在:
```ts
const SUPPORTED_PACKAGE_ASSET = /\.(glb|gltf|obj|vrm|png|jpe?g|webp|ktx2|hdr|exr)$/i;
const UNITY_DOCUMENT = /\.(unity|prefab)$/i;
```
置換:
```ts
import {
  extensionPattern,
  extensionsForKinds,
  mimeTypeForPath,
  STUDIO_NATIVE_MODEL_FORMATS,
} from "./asset-format-registry";

/**
 * Unity packages ship authoring formats (FBX, PSD) the converter does not
 * accept, so only the Studio-native model formats and image formats convert.
 */
const SUPPORTED_PACKAGE_ASSET = extensionPattern([
  ...STUDIO_NATIVE_MODEL_FORMATS,
  ...extensionsForKinds(["texture", "skybox"], { includeLegacy: false }),
]);
const UNITY_DOCUMENT = /\.(unity|prefab)$/i;
```
挙動変化: **あり（意図的・乖離の修正本体）**。`.avif` / `.gif` / `.bmp` / `.svg` を含む unitypackage が、これまで無視されていたのに Texture Asset として取り込まれるようになる。`.fbx` / `.dae` は従来通り非対応で、L1258 の `countUnsupportedAssetExtensions` 警告経路に残る。

---

### (10) `unity-package-import.ts` L1398–1422 `mimeTypeForPath`（関数ごと削除）

現在:
```ts
function mimeTypeForPath(path: string): string {
  switch (extensionOf(path)) {
    case "glb":
      return "model/gltf-binary";
    ...
    default:
      return "application/octet-stream";
  }
}
```
置換: **関数を削除**し、(9) の import で registry の `mimeTypeForPath` を使用。呼び出し側 L217 `mimeType: mimeTypeForPath(entry.path),` は無変更。

挙動変化: **あり（意図的）**。`.avif` / `.gif` / `.bmp` / `.svg` に正しい MIME が付く（従来は `application/octet-stream` → `classifyAssetImport` が拡張子で救っていたが、そもそも (9) で弾かれていた）。`.mp3` / `.wav` にも MIME が付くが、(9) のフィルタで到達しないため実害なし。

なお、この関数が唯一の利用者だったローカル `extensionOf`（L1424）は他にも `countUnsupportedAssetExtensions` が使うため**残す**。

---

### (11) `asset-manifest.ts` L690–712 `getTextureSourceFormat`

現在:
```ts
export function getTextureSourceFormat(
  asset: TextureAsset,
): TextureSourceFormat | undefined {
  if (asset.importMetadata?.sourceFormat) return asset.importMetadata.sourceFormat;
  if (asset.source.kind !== "project") return undefined;
  const extension = asset.source.relativePath.split(".").pop()?.toLowerCase();
  if (extension === "jpg") return "jpeg";
  return [
    "png",
    "jpeg",
    "webp",
    "avif",
    "gif",
    "bmp",
    "svg",
    "ktx2",
    "hdr",
    "exr",
  ].includes(
    extension ?? "",
  )
    ? (extension as TextureSourceFormat)
    : undefined;
}
```
置換:
```ts
export function getTextureSourceFormat(
  asset: TextureAsset,
): TextureSourceFormat | undefined {
  if (asset.importMetadata?.sourceFormat) return asset.importMetadata.sourceFormat;
  if (asset.source.kind !== "project") return undefined;
  return textureSourceFormatForExtension(
    extensionOfPath(asset.source.relativePath),
  ) as TextureSourceFormat | undefined;
}
```
import 追加:
```ts
import {
  extensionOfPath,
  textureSourceFormatForExtension,
} from "./asset-format-registry";
```
さらに L431–441 の型定義を導出に変更（任意・推奨）:
```ts
export type TextureSourceFormat = StudioImageFormat | SkyboxFormat;
```
挙動変化: **微小な拡大**。従来は `relativePath.split(".").pop()` だったため `assets/a.b/c`（拡張子なし・ディレクトリにドット）で誤動作しうる。新実装は leaf 名とクエリを除去してから拡張子を取るため厳密になる。`jpg → jpeg` 正規化、`.ktx` を認めない点は同一。

---

### (12) `asset-import.ts` L318–352（3関数の削除と置換）

現在:
```ts
function modelFormatFromSource(
  extension: string,
  mimeType: string,
): ThreeEditorModelFormat | undefined {
  if (isThreeEditorModelFormat(extension)) return extension;
  if (mimeType === "model/gltf-binary") return "glb";
  if (mimeType === "model/gltf+json") return "gltf";
  if (mimeType === "model/vrm") return "vrm";
  if (mimeType === "model/obj" || mimeType === "text/obj") return "obj";
  if (mimeType === "model/fbx") return "fbx";
  if (mimeType === "model/stl") return "stl";
  return undefined;
}

function modelMimeType(format: ThreeEditorModelFormat): string {
  if (format === "glb") return "model/gltf-binary";
  if (format === "gltf") return "model/gltf+json";
  if (format === "vrm") return "model/vrm";
  if (format === "obj") return "model/obj";
  if (format === "svg") return "image/svg+xml";
  return `model/${format}`;
}

function studioImageFormatFromMimeType(
  mimeType: string,
): StudioImageFormat | undefined {
  return (Object.entries(STUDIO_IMAGE_FORMATS) as Array<
    [StudioImageFormat, (typeof STUDIO_IMAGE_FORMATS)[StudioImageFormat]]
  >).find(([, definition]) => definition.mimeType === mimeType)?.[0];
}

function isStudioNativeModelFormat(
  format: ThreeEditorModelFormat,
): format is (typeof STUDIO_NATIVE_MODEL_FORMATS)[number] {
  return (STUDIO_NATIVE_MODEL_FORMATS as readonly string[]).includes(format);
}
```
置換: **4関数とも削除**し、import を差し替える。

```ts
import {
  isStudioNativeModelFormat,
  modelFormatForSource,
  modelMimeType,
  studioImageFormatForExtension,
  studioImageFormatForMimeType,
  STUDIO_IMAGE_FORMATS,
  type StudioImageFormat,
  type ThreeEditorModelFormat,
} from "./asset-format-registry";
```

`classifyAssetImport` 本体（L205–230）の該当行:
```ts
  const modelFormat = modelFormatFromSource(extension, normalizedMime);
```
→
```ts
  const modelFormat = modelFormatForSource(extension, normalizedMime);
```
```ts
  const imageFormat =
    studioImageFormatForExtension(extension) ??
    studioImageFormatFromMimeType(normalizedMime);
```
→
```ts
  const imageFormat =
    studioImageFormatForExtension(extension) ??
    studioImageFormatForMimeType(normalizedMime);
```

挙動変化: **あり（軽微・意図的）**。
- `modelFormatForSource` の MIME 逆引きが `model/3ds`、`model/dae` … 全形式に広がる（従来は glb/gltf/vrm/obj/fbx/stl のみ）。`resolveFromMimeType: false` により `image/svg+xml` は model に解決されず、従来通り texture になる。
- `studioImageFormatForMimeType` は `altMimeTypes` も見るため `image/ktx` が ktx2 に解決される。ただし L237–247 の既存 ktx2 分岐が先に効くため実質差なし。
- L241 の ktx2 分岐、L250–300 の hdr/exr/mp3/wav 分岐は **今回は残す**（`ClassifiedAssetImport` の判別ユニオン型が kind ごとに MIME を literal で固定しているため、table 駆動化には型側の変更が必要。Phase 2 の `asset-import.ts` 分割時に対応することを推奨）。

---

### (13) `VisualEditorPrototype.tsx` L291–296（未指摘・追加）

現在:
```ts
const SUPPORTED_MODEL_FILE = THREE_EDITOR_MODEL_EXTENSION_PATTERN;
const SUPPORTED_TEXTURE_FILE = STUDIO_IMAGE_EXTENSION_PATTERN;
const SUPPORTED_HDRI_FILE = /\.(hdr|exr)$/i;
const SUPPORTED_AUDIO_FILE = /\.(?:mp3|wav)$/i;
const SUPPORTED_SHADER_FILE = /\.(?:glsl|vert|vertex|vs|frag|fragment|fs)$/i;
const SUPPORTED_UNITY_FILE = /\.(unitypackage|unity|prefab)$/i;
```
置換: 6定数を削除し、L7112–7141 のループを `kindForPath` 1本に畳む。

```ts
// import 側
import {
  kindForPath,
  PROJECT_PACKAGE_EXTENSION_PATTERN,
  type AssetFormatKind,
} from "../../lib/visual-editor";

const IMPORT_RESOURCE_KIND: Readonly<
  Partial<Record<AssetFormatKind, PendingImport["resourceKind"]>>
> = {
  texture: "texture",
  model: "model",
  skybox: "skybox",
  audio: "audio",
  shader: "shader",
};
```
L7112–7141:
```ts
    const accepted: Array<{
      file: File;
      resourceKind: PendingImport["resourceKind"];
    }> = [];
    const unsupported: File[] = [];
    for (const file of files) {
      if (companionPaths.has(importBatchPath(file))) continue;
      if (PROJECT_PACKAGE_EXTENSION_PATTERN.test(file.name)) {
        accepted.push({ file, resourceKind: "unity-package" });
        continue;
      }
      const kind = kindForPath(file.name);
      const resourceKind = kind ? IMPORT_RESOURCE_KIND[kind] : undefined;
      if (resourceKind) accepted.push({ file, resourceKind });
      else unsupported.push(file);
    }
```
挙動変化: **なし**（判定順序は `unity → texture → model → skybox → audio → shader` で、registry の解決優先順位 texture→skybox→audio→shader→model と `.svg` 以外で衝突しない。`.svg` は両方とも texture）。副次的に「accept されたが unsupported にも数えられる」という現行の二重ループが1本になり、`companion` 拡張子（`.bin` `.mtl` 等）が単独ドロップ時に `unsupported` へ落ちる挙動も同一。

---

### (14) `SceneViewport.tsx` L2350（未指摘・追加）

現在:
```ts
  return /\.(?:glb|gltf|obj|vrm)$/i.test(relativePath) ? relativePath : undefined;
```
置換:
```ts
  return NATIVE_MODEL_EXTENSION_PATTERN.test(relativePath)
    ? relativePath
    : undefined;
```
挙動変化: **なし**。

---

### (15) UI — `AssetsPanel.tsx` L109–159

現在（label / icon の2つの switch、計50行）:
```ts
function assetKindLabel(asset: SceneAsset): string {
  switch (asset.kind) {
    case "primitive":
      return "Primitive";
    ...
    case "template":
      return "Prefab";
  }
}

function assetIconName(asset: SceneAsset): EditorIconName {
  switch (asset.kind) {
    case "model":
      return "model";
    ...
    case "primitive":
      return "primitive";
  }
}
```
置換:
```ts
function assetKindLabel(asset: SceneAsset): string {
  // HDRI Textures share the Texture kind but read as a different asset class.
  if (asset.kind === "texture" && isEnvironmentTextureAsset(asset)) {
    return ASSET_KIND_UI.skybox.label;
  }
  return ASSET_KIND_UI[asset.kind].label;
}

function assetIconName(asset: SceneAsset): EditorIconName {
  return ASSET_KIND_UI[asset.kind].icon;
}
```
import: `ASSET_KIND_UI` を `../../lib/visual-editor` から追加。

挙動変化: **なし**（`skybox.label === "Texture / HDRI"`、`skybox.icon === "texture"` は現行と一致）。

---

### (16) UI — `AssetQuickEditor.tsx` L380–400 `AssetThumbnailFallback`

現在:
```ts
  const Icon =
    asset.kind === "particle"
      ? EDITOR_ICONS.particle
      : asset.kind === "audio"
        ? EDITOR_ICONS.audio
      : asset.kind === "script"
        ? EDITOR_ICONS.script
      : asset.kind === "shader"
        ? EDITOR_ICONS.script
      : asset.kind === "template"
        ? EDITOR_ICONS.prefab
        : asset.kind === "texture"
          ? EDITOR_ICONS.texture
          : asset.kind === "skybox"
            ? EDITOR_ICONS.skybox
          : asset.kind === "model"
            ? EDITOR_ICONS.model
            : asset.kind === "material"
              ? EDITOR_ICONS.material
              : EDITOR_ICONS.asset;
```
置換:
```ts
  const Icon = EDITOR_ICONS[ASSET_KIND_UI[asset.kind].icon];
```
挙動変化: **実質なし**。`skybox` が `EDITOR_ICONS.skybox` → `EDITOR_ICONS.texture` になるが、`editor-icons.tsx` L70/L118 でどちらも lucide の `Image` を指すため描画は同一。`primitive` / `interactivity` は従来 `EDITOR_ICONS.asset` にフォールバックしていたが、新テーブルではそれぞれ `primitive` / `asset` になる — **`primitive` のアイコンが Palette から Cuboid に変わる**（AssetsPanel と一致する方向の統一。要承認）。

### (17) UI — `AssetQuickEditor.tsx` L605–612

現在:
```ts
  const Icon = EDITOR_ICONS[
    asset.kind === "texture"
      ? "texture"
      : asset.kind === "material"
        ? "material"
        : "model"
  ];
```
置換:
```ts
  const Icon = EDITOR_ICONS[ASSET_KIND_UI[asset.kind].icon];
```
挙動変化: この分岐は `texture` / `material` / `model` 以外に到達しないため**なし**。

---

## A-3. 再発防止 lint

`eslint.config` に追加（`asset-format-registry.ts` 自身は除外）:

```js
{
  files: ["src/**/*.ts", "src/**/*.tsx"],
  ignores: ["src/lib/visual-editor/asset-format-registry.ts"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        // Any regex literal enumerating two or more known asset extensions.
        selector:
          "Literal[regex.pattern=/(glb|gltf|vrm|png|jpe\\?g|webp|avif|ktx2|hdr|exr|mp3|wav|glsl)\\|/]",
        message:
          "拡張子の列挙は asset-format-registry.ts の ASSET_FORMATS に集約してください",
      },
      {
        selector:
          "Literal[value=/^(image|model|audio)\\/[a-z0-9+.-]+$/]",
        message:
          "MIME type リテラルは asset-format-registry.ts から取得してください",
      },
    ],
  },
}
```

---

## A-4. 承認が必要な behavior deltas

| # | 内容 | 影響箇所 | 判断 |
|---|---|---|---|
| **D-1** | **unitypackage から `.avif` / `.gif` / `.bmp` / `.svg` を Texture として取り込むようになる**（従来は無視され警告すら出なかった） | (9) | 乖離修正の本丸。承認推奨 |
| **D-2** | **Classic / component-code のソース走査が `.avif` / `.gif` / `.bmp` / `.svg` / `.ktx` を検出する** | (3)(7) | 同上。承認推奨 |
| **D-3** | **Classic / component-code のソース走査が three.js Editor 対応の残り21モデル形式（fbx / dae / stl / usdz …）を検出する**。検出後は既存の `three-model-converter` を通るが、Classic プロジェクト内のこれらのファイルはこれまで一度も変換経路に乗っていない | (3)(7) | **要判断**。`component-code-import.ts` の `importedAssetKind` は既に全27形式を model 扱いしていたので下流は整合するが、変換失敗の診断が増える可能性あり。段階導入するなら registry に `scanInSource: false` を該当形式へ付与して次フェーズに回せる |
| **D-4** | `.json` は引き続きソース走査の対象外（`scanInSource: false`）。`THREE_EDITOR_MODEL_EXTENSION_PATTERN` は従来通り `.json` にマッチするため、走査経路とマッチ経路で意図的に非対称 | registry | 現行の実効挙動と同一。データとして明示化しただけ |
| **D-5** | `AssetQuickEditor` のサムネイル fallback で **primitive Asset のアイコンが Palette → Cuboid** に変わる | (16) | AssetsPanel と統一する方向。承認推奨 |
| **D-6** | `getTextureSourceFormat` の拡張子抽出が `split(".").pop()` から leaf+クエリ除去ベースに厳密化 | (11) | バグ修正扱い |
| **D-7** | すべての拡張子パターンが末尾 `(?:[?#].*)?$` を許容するようになる（`MODEL_COMPANION_PATTERN` / unity の `SUPPORTED_PACKAGE_ASSET` は従来 `$` のみ） | (5)(9) | 実データはローカルパス／zip エントリなので無害 |
| **D-8** | `unitypackage` 内の `.mp3` / `.wav` は **依然として取り込まない**（`countUnsupportedAssetExtensions` の警告のみ）。registry 上は audio kind が存在するので1行で有効化できるが、今回は据え置き | (9) | 据え置きを承認、または別チケット化 |

---

## Task B — KHR material 拡張のテーブル駆動化

## B-0. 実測した「手書き実装」の数 = **5**

| # | 場所 | 内容 |
|---|---|---|
| 1 | `asset-manifest.ts` L240–305 / L909–985 | `KhrMaterials*` 型 × 11 と `KhrMaterials*Patch` 型 × 11 |
| 2 | `asset-manifest.ts` L1321–1663（343行） | `applyMaterialExtensionsPatch` |
| 3 | `asset-manifest.ts` L1665–1832（168行） | `cloneMaterialExtensions` |
| 4 | `gltf-derived-assets.ts` L675–747 | `materialExtensions`（**11中5しか実装なし = B2**） |
| 5 | **（未指摘）** `serialization.ts` L483–880（約400行） | `SUPPORTED_MATERIAL_EXTENSIONS` + `validateMaterialExtension` の switch + 依存/競合の3ブロック |
| （6） | `AssetQuickEditor.tsx` L1353–1366 | `disabledLitMaterialExtensions` の11行手書き |

本仕様は 2 / 3 / 4 を表駆動化し、5 と 6 は**同じ表から駆動できる形にしておく**（実装は同一 PR でも次の PR でも可）。型（1）は判別ユニオンとして残す — 表から型を生成すると `MaterialExtensionSchemaRegistry` の declaration-merge 境界（L297 のコメントが明示している拡張ポイント）が壊れるため。

---

## B-1. 新ファイル `src/lib/visual-editor/material-extension-registry.ts`（全文）

```ts
import type {
  Color3,
  MaterialExtensionSchemaRegistry,
} from "./asset-manifest";

/**
 * Single source of truth for the KHR_materials_* extensions the editor
 * authors. Patch application, deep cloning, glTF import, document validation
 * and the Inspector sections all derive from this table.
 *
 * Adding an extension is a table entry plus the two typed interfaces in
 * `asset-manifest.ts`; nothing else re-enumerates the extension list.
 */

export type MaterialExtensionName = keyof MaterialExtensionSchemaRegistry;

/**
 * Value shapes the extensions use. Each kind fixes both the accepted range
 * and the glTF default, so validation, patching and import agree by
 * construction.
 */
export type MaterialExtensionFieldDescriptor =
  /** Finite number in [0, 1]. */
  | { readonly kind: "unit"; readonly name: string; readonly default: number }
  /** Finite number >= 0. */
  | { readonly kind: "nonNegative"; readonly name: string; readonly default: number }
  /** Any finite number (radians and similar). */
  | { readonly kind: "finite"; readonly name: string; readonly default: number }
  /** Finite number >= 1. */
  | { readonly kind: "atLeastOne"; readonly name: string; readonly default: number }
  /** 0 (legacy dielectric mode) or a finite number >= 1. */
  | { readonly kind: "ior"; readonly name: string; readonly default: number }
  /** Optional finite number > 0; omission means infinity. */
  | { readonly kind: "positiveOptional"; readonly name: string }
  /** Three numbers in [0, 1]. */
  | { readonly kind: "unitColor3"; readonly name: string; readonly default: Color3 }
  /** Three finite numbers >= 0; the extension permits HDR values above 1. */
  | { readonly kind: "nonNegativeColor3"; readonly name: string; readonly default: Color3 }
  /** `MaterialTextureInfo`. */
  | { readonly kind: "texture"; readonly name: string }
  /** `NormalTextureInfo` (adds `scale`). */
  | { readonly kind: "normalTexture"; readonly name: string };

export type MaterialExtensionDescriptor = {
  /**
   * Declaration order is the emission order of the produced object, so it
   * matches the field order of the corresponding interface.
   */
  readonly fields: readonly MaterialExtensionFieldDescriptor[];
  /** Extensions glTF requires to be present alongside this one. */
  readonly requires?: readonly MaterialExtensionName[];
  /** Replaces the lit shading model and cannot be combined with any other. */
  readonly exclusive?: boolean;
  /** Inspector section title. */
  readonly label: string;
};

export const MATERIAL_EXTENSION_DESCRIPTORS = {
  KHR_materials_anisotropy: {
    label: "Anisotropy",
    fields: [
      { kind: "unit", name: "anisotropyStrength", default: 0 },
      { kind: "finite", name: "anisotropyRotation", default: 0 },
      { kind: "texture", name: "anisotropyTexture" },
    ],
  },
  KHR_materials_clearcoat: {
    label: "Clearcoat",
    fields: [
      { kind: "unit", name: "clearcoatFactor", default: 0 },
      { kind: "texture", name: "clearcoatTexture" },
      { kind: "unit", name: "clearcoatRoughnessFactor", default: 0 },
      { kind: "texture", name: "clearcoatRoughnessTexture" },
      { kind: "normalTexture", name: "clearcoatNormalTexture" },
    ],
  },
  KHR_materials_dispersion: {
    label: "Dispersion",
    requires: ["KHR_materials_volume"],
    fields: [{ kind: "nonNegative", name: "dispersion", default: 0 }],
  },
  KHR_materials_emissive_strength: {
    label: "Emissive strength",
    fields: [{ kind: "nonNegative", name: "emissiveStrength", default: 1 }],
  },
  KHR_materials_ior: {
    label: "IOR",
    fields: [{ kind: "ior", name: "ior", default: 1.5 }],
  },
  KHR_materials_iridescence: {
    label: "Iridescence",
    fields: [
      { kind: "unit", name: "iridescenceFactor", default: 0 },
      { kind: "texture", name: "iridescenceTexture" },
      { kind: "atLeastOne", name: "iridescenceIor", default: 1.3 },
      // A descending range is explicitly valid, so both ends are plain
      // non-negative numbers with no cross-field ordering rule.
      { kind: "nonNegative", name: "iridescenceThicknessMinimum", default: 100 },
      { kind: "nonNegative", name: "iridescenceThicknessMaximum", default: 400 },
      { kind: "texture", name: "iridescenceThicknessTexture" },
    ],
  },
  KHR_materials_sheen: {
    label: "Sheen",
    fields: [
      { kind: "unitColor3", name: "sheenColorFactor", default: [0, 0, 0] },
      { kind: "texture", name: "sheenColorTexture" },
      { kind: "unit", name: "sheenRoughnessFactor", default: 0 },
      { kind: "texture", name: "sheenRoughnessTexture" },
    ],
  },
  KHR_materials_specular: {
    label: "Specular",
    fields: [
      { kind: "unit", name: "specularFactor", default: 1 },
      { kind: "texture", name: "specularTexture" },
      {
        kind: "nonNegativeColor3",
        name: "specularColorFactor",
        default: [1, 1, 1],
      },
      { kind: "texture", name: "specularColorTexture" },
    ],
  },
  KHR_materials_transmission: {
    label: "Transmission",
    fields: [
      { kind: "unit", name: "transmissionFactor", default: 0 },
      { kind: "texture", name: "transmissionTexture" },
    ],
  },
  KHR_materials_unlit: {
    label: "Unlit",
    exclusive: true,
    fields: [],
  },
  KHR_materials_volume: {
    label: "Volume",
    requires: ["KHR_materials_transmission"],
    fields: [
      { kind: "nonNegative", name: "thicknessFactor", default: 0 },
      { kind: "texture", name: "thicknessTexture" },
      { kind: "positiveOptional", name: "attenuationDistance" },
      { kind: "unitColor3", name: "attenuationColor", default: [1, 1, 1] },
    ],
  },
} as const satisfies Readonly<
  Record<MaterialExtensionName, MaterialExtensionDescriptor>
>;

/** Stable iteration order for every table-driven pass. */
export const MATERIAL_EXTENSION_NAMES = Object.keys(
  MATERIAL_EXTENSION_DESCRIPTORS,
) as readonly MaterialExtensionName[];

/** Extensions that participate in the lit shading model. */
export const LIT_MATERIAL_EXTENSION_NAMES = MATERIAL_EXTENSION_NAMES.filter(
  (name) => MATERIAL_EXTENSION_DESCRIPTORS[name].exclusive !== true,
);

export function isMaterialExtensionName(
  value: string,
): value is MaterialExtensionName {
  return Object.prototype.hasOwnProperty.call(
    MATERIAL_EXTENSION_DESCRIPTORS,
    value,
  );
}

/** Field names an extension object may carry, for `validateKnownKeys`. */
export function materialExtensionFieldNames(
  name: MaterialExtensionName,
): readonly string[] {
  return MATERIAL_EXTENSION_DESCRIPTORS[name].fields.map(
    (field) => field.name,
  );
}

export type MaterialExtensionDropReason = "dependency" | "unlit-conflict";

/**
 * Removes entries whose declared dependencies are unmet and, when an
 * exclusive extension is present, everything it conflicts with. Runs to a
 * fixed point so a chain (dispersion -> volume -> transmission) collapses in
 * one call.
 */
export function pruneMaterialExtensions<Value>(
  present: Readonly<Partial<Record<MaterialExtensionName, Value>>>,
  onDrop?: (
    name: MaterialExtensionName,
    reason: MaterialExtensionDropReason,
  ) => void,
): Partial<Record<MaterialExtensionName, Value>> {
  const result: Partial<Record<MaterialExtensionName, Value>> = { ...present };

  const exclusive = MATERIAL_EXTENSION_NAMES.find(
    (name) =>
      MATERIAL_EXTENSION_DESCRIPTORS[name].exclusive === true &&
      result[name] !== undefined,
  );
  if (exclusive) {
    for (const name of MATERIAL_EXTENSION_NAMES) {
      if (name === exclusive || result[name] === undefined) continue;
      delete result[name];
      onDrop?.(name, "unlit-conflict");
    }
    return result;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const name of MATERIAL_EXTENSION_NAMES) {
      if (result[name] === undefined) continue;
      const requires = MATERIAL_EXTENSION_DESCRIPTORS[name].requires ?? [];
      if (requires.every((required) => result[required] !== undefined)) continue;
      delete result[name];
      onDrop?.(name, "dependency");
      changed = true;
    }
  }
  return result;
}
```

---

## B-2. 汎用実装

### B-2-a. `applyMaterialExtensionsPatch` / `cloneMaterialExtensions`（`asset-manifest.ts` 内）

L1321–1846 の `applyMaterialExtensionsPatch` / `cloneMaterialExtensions` / `cloneIridescence` を**まるごと削除**し、以下で置換する（`resolveTextureInfo` などの private helper が同ファイルにあるため、汎用実装もこのファイルに置く）。

```ts
import {
  MATERIAL_EXTENSION_DESCRIPTORS,
  MATERIAL_EXTENSION_NAMES,
  type MaterialExtensionFieldDescriptor,
  type MaterialExtensionName,
} from "./material-extension-registry";

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
```

**削除される旧シンボル**（すべて module-private、外部利用者ゼロ）:
- `applyMaterialExtensionsPatch` の 343 行の if 連鎖本体
- `cloneMaterialExtensions` の 168 行のスプレッド連鎖本体
- `cloneIridescence`（L1813–1830）

**保持が必要な helper**: `resolveTextureInfo` / `resolveNormalTextureInfo` / `cloneTextureInfo` / `cloneNormalTextureInfo` / `cloneColor3` / `hasOwn` / `isUnitInterval` / `isValidColor3` / `isNonNegativeColor3` / `isNonNegativeFinite` / `isPositiveFinite` / `isFiniteNumber` / `isValidMaterialIor`。

### B-2-b. `extensionsFromGltf`（`gltf-derived-assets.ts` 内）

L675–747 の `materialExtensions` を**まるごと削除**し、以下で置換。

```ts
import {
  MATERIAL_EXTENSION_DESCRIPTORS,
  MATERIAL_EXTENSION_NAMES,
  pruneMaterialExtensions,
  type MaterialExtensionName,
} from "./material-extension-registry";

/**
 * Reads every extension the editor supports out of a glTF material. Values
 * are coerced to the descriptor's range here so `applyMaterialExtensionsPatch`
 * never has to fall back, and unmet dependencies are dropped so the produced
 * manifest passes `assetManifestCodec` validation.
 */
function materialExtensions(
  extensions: JsonObject | undefined,
  textureAssetIds: ReadonlyMap<number, string>,
  materialIndex: number,
  warnings: GltfDerivedAssetWarning[],
): MaterialExtensionsPatch {
  if (!extensions) return {};
  const collected: Partial<Record<MaterialExtensionName, JsonObject>> = {};

  for (const name of MATERIAL_EXTENSION_NAMES) {
    const source = objectValue(extensions[name]);
    if (!source) continue;
    const basePath = `materials[${materialIndex}].extensions.${name}`;
    const value: JsonObject = {};
    for (const field of MATERIAL_EXTENSION_DESCRIPTORS[name].fields) {
      const raw = source[field.name];
      const path = `${basePath}.${field.name}`;
      switch (field.kind) {
        case "texture": {
          const texture = textureInfo(raw, textureAssetIds, path, warnings);
          if (texture) value[field.name] = texture;
          break;
        }
        case "normalTexture": {
          const texture = normalTextureInfo(
            raw,
            textureAssetIds,
            path,
            warnings,
          );
          if (texture) value[field.name] = texture;
          break;
        }
        case "positiveOptional": {
          const number = finiteNumber(raw, Number.NaN);
          if (Number.isFinite(number) && number > 0) value[field.name] = number;
          break;
        }
        case "unitColor3":
          value[field.name] = colorTuple(raw, 3, [...field.default]);
          break;
        case "nonNegativeColor3":
          // The extension deliberately allows HDR values above 1, so this
          // must not clamp the way `colorTuple` does.
          value[field.name] = nonNegativeColorTuple(raw, field.default);
          break;
        case "unit":
          value[field.name] = unitNumber(raw, field.default);
          break;
        case "nonNegative":
          value[field.name] = nonNegativeNumber(raw, field.default);
          break;
        case "finite":
          value[field.name] = finiteNumber(raw, field.default);
          break;
        case "atLeastOne": {
          const number = finiteNumber(raw, field.default);
          value[field.name] = number >= 1 ? number : field.default;
          break;
        }
        case "ior": {
          const number = finiteNumber(raw, field.default);
          value[field.name] =
            number === 0 || number >= 1 ? number : field.default;
          break;
        }
      }
    }
    collected[name] = value;
  }

  const pruned = pruneMaterialExtensions(collected, (name, reason) => {
    warnings.push({
      code:
        reason === "dependency"
          ? "gltf-material-extension-dependency-unmet"
          : "gltf-material-extension-unlit-conflict",
      message:
        reason === "dependency"
          ? `${name} が必要とする拡張が同じMaterialに存在しないため取り込みませんでした`
          : `${name} は KHR_materials_unlit と併用できないため取り込みませんでした`,
      fieldPath: `materials[${materialIndex}].extensions.${name}`,
    });
  });
  return pruned as MaterialExtensionsPatch;
}

function nonNegativeColorTuple(
  value: unknown,
  fallback: Color3,
): [number, number, number] {
  return Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (entry) => typeof entry === "number" && Number.isFinite(entry) && entry >= 0,
    )
    ? [Number(value[0]), Number(value[1]), Number(value[2])]
    : [...fallback];
}
```

`Color3` を type import に追加:
```ts
import {
  normalizeMaterialProperties,
  normalizeTextureImportSettings,
  type AssetManifest,
  type Color3,
  ...
} from "./asset-manifest";
```

**削除される旧シンボル**: `materialExtensions` の 73 行の手書き本体のみ。呼び出し側（L666–671 の `materialPatch` 内）は無変更。

---

## B-3. 併せて表駆動化できる 2 箇所（同一 PR 推奨）

### `serialization.ts` L483–494 / L620–660 / L664–880

```ts
// L483-494 を置換
import {
  isMaterialExtensionName,
  MATERIAL_EXTENSION_DESCRIPTORS,
  materialExtensionFieldNames,
  MATERIAL_EXTENSION_NAMES,
  type MaterialExtensionName,
} from "./material-extension-registry";
```
`SUPPORTED_MATERIAL_EXTENSIONS.has(extensionName)` → `isMaterialExtensionName(extensionName)`。

L620–660 の3ブロック（unlit 競合 / volume→transmission / dispersion→volume）を1ループへ:
```ts
  const exclusive = MATERIAL_EXTENSION_NAMES.find(
    (name) =>
      MATERIAL_EXTENSION_DESCRIPTORS[name].exclusive === true &&
      name in extensions,
  );
  if (exclusive && extensionNames.some((name) => name !== exclusive)) {
    issues.push(
      issue(
        `${path}.properties.extensions.${exclusive}`,
        "extension-conflict",
        `${exclusive} cannot be combined with lighting material extensions`,
      ),
    );
  }
  for (const name of MATERIAL_EXTENSION_NAMES) {
    if (!(name in extensions)) continue;
    for (const required of MATERIAL_EXTENSION_DESCRIPTORS[name].requires ?? []) {
      if (required in extensions) continue;
      issues.push(
        issue(
          `${path}.properties.extensions.${name}`,
          "extension-dependency",
          `${name} requires ${required}`,
        ),
      );
    }
  }
```
L664–880 の 216 行の switch は、フィールド descriptor をループする 40 行程度へ縮約可能（`validateKnownKeys(extension, materialExtensionFieldNames(name), path, issues)` + kind ごとの validator dispatch）。

**メッセージ文字列は完全一致**（`"KHR_materials_volume requires KHR_materials_transmission"` 等）を維持すること。fixture は code のみを見ているが、classic importer が診断 message を正規表現でパースしている（監査 T5）ため。

### `AssetQuickEditor.tsx` L1353–1366

```ts
function disabledLitMaterialExtensions(): MaterialExtensionsPatch {
  return Object.fromEntries(
    LIT_MATERIAL_EXTENSION_NAMES.map((name) => [name, null]),
  ) as MaterialExtensionsPatch;
}
```

---

## B-4. 旧コード削除前の等価性証明

### 使うべき既存 fixture

| fixture | 登録名 | カバー範囲 |
|---|---|---|
| `src/lib/visual-editor/compiler/material-extensions.fixture.ts` | `runMaterialExtensionFixtureAssertions` | **本命**。11拡張中10種の生成、TextureInfo + `KHR_texture_transform` の往復、部分パッチが兄弟拡張を壊さないこと、`null` による削除、`unlit` 競合、volume→transmission / dispersion→volume の依存拒否、compile 出力への反映 |
| `src/lib/visual-editor/gltf-derived-assets.fixture.ts` | `runGltfDerivedAssetFixtureAssertions` | glTF → Material/Texture Asset 導出、`KHR_texture_transform` |
| `src/lib/visual-editor/model-import-contract.fixture.ts` | `runModelImportContractFixtureAssertions` | model 再取込時の material slot 保持 |
| `src/lib/visual-editor/open-brush.fixture.ts` | `runOpenBrushFixtureAssertions` | glTF material + custom shader 併走経路 |
| `src/lib/visual-editor/classic-export.fixture.ts` | `runClassicExportFixtureAssertions` | Material properties の往復 |

実行: `pnpm cli:test`（`scripts/check-fixture-coverage.mjs` → `cli/convert.fixture.mjs`）と `pnpm typecheck`。

### パリティ検査の手順（3コミット構成）

**コミット1 — 表と汎用実装を追加、旧実装は残す**

1. `material-extension-registry.ts` を追加。
2. `asset-manifest.ts` の既存2関数を `applyMaterialExtensionsPatchLegacy` / `cloneMaterialExtensionsLegacy` にリネーム（本文は1文字も変えない）。`cloneIridescence` はそのまま。
3. B-2-a の新実装を追加。`applyMaterialPatch` L1280 の呼び出し先は **legacy のまま**にする。
4. 一時 fixture `src/lib/visual-editor/material-extension-parity.fixture.ts` を追加し、`cli/convert.fixture.mjs` の `runFixtureSuites([...])` テーブルへ登録:

```ts
import { stableSerializeJson } from "./serialization";

/**
 * Temporary: proves the table-driven implementation is byte-identical to the
 * hand-written one. Deleted together with the legacy functions.
 */
export function runMaterialExtensionParityFixtureAssertions(): void {
  for (const [label, base, patch] of PARITY_CASES) {
    const legacy = applyMaterialExtensionsPatchLegacy(base, patch, MANIFEST);
    const next = applyMaterialExtensionsPatch(base, patch, MANIFEST);
    if (stableSerializeJson(legacy) !== stableSerializeJson(next)) {
      throw new Error(`applyMaterialExtensionsPatch diverged: ${label}`);
    }
    if (
      stableSerializeJson(cloneMaterialExtensionsLegacy(legacy)) !==
      stableSerializeJson(cloneMaterialExtensions(next))
    ) {
      throw new Error(`cloneMaterialExtensions diverged: ${label}`);
    }
  }
}
```

`PARITY_CASES` は 11拡張 × 以下 8 パターンの直積（約 90 ケース）を機械生成する:

| パターン | 目的 |
|---|---|
| 空の base に `{}` を適用 | 全フィールドのデフォルト値が一致するか |
| 全フィールド有効値 | 正常系 |
| 各数値フィールドに範囲外値（`-1`, `2`, `NaN`, `"x"`, `null`, `undefined`）を1つずつ | validator の境界が一致するか（**`isUnitInterval` と `isNonNegativeFinite` と `isFiniteNumber` の取り違えを検出**） |
| 各 color3 に `[1.2, 0.9, 0.7]`（HDR）と `[-1,0,0]` | `specularColorFactor` だけが HDR 許容であることの検証 |
| texture を id 文字列 / オブジェクト / `null` で指定 | `resolveTextureInfo` 経路 |
| texture に `transform: {…}` / `transform: null` / デフォルト値の transform | transform の省略・除去 |
| 既存値ありの base に 1 フィールドだけのパッチ | 未指定フィールドが base から引き継がれるか |
| `attenuationDistance` に `null` / `0` / `-1` / `4` | `positiveOptional` の3分岐 |
| patch に `null` / キー欠落 | 削除 vs 無視 |

**注意すべき既知の非等価点が1つある**: 旧 `cloneMaterialExtensions` は TextureInfo を `{...texture}` で浅くコピーしており、`transform` オブジェクトを**共有**していた。新実装は `cloneTextureInfo` を通すため `transform` も複製される。`stableSerializeJson` 比較では検出されないが、参照共有に依存したコードがあると挙動が変わる。これは**潜在バグの修正であり意図的**（deltas 参照）。参照同一性まで検査したい場合は parity fixture に `clone.transform !== source.transform` の assertion を別途置く。

**コミット2 — 切替**

5. `applyMaterialPatch` L1280 の呼び出しを新実装へ向ける。
6. `gltf-derived-assets.ts` の `materialExtensions` を B-2-b で置換。
7. **glTF 取込の B2 回帰テストを `gltf-derived-assets.fixture.ts` に追加**（これが恒久的な回帰網になる）:

```ts
// 11拡張すべてを含む合成 glTF から Material Asset を導出し、
// 全 11 拡張が properties.extensions に残ることを検査する。
const ALL_EXTENSION_MATERIAL = {
  extensions: {
    KHR_materials_anisotropy: { anisotropyStrength: 0.4, anisotropyRotation: 0.25 },
    KHR_materials_clearcoat: { clearcoatFactor: 0.8, clearcoatRoughnessFactor: 0.2 },
    KHR_materials_transmission: { transmissionFactor: 0.65 },
    KHR_materials_volume: { thicknessFactor: 0.4, attenuationDistance: 4, attenuationColor: [0.8, 0.9, 1] },
    KHR_materials_dispersion: { dispersion: 0.15 },
    KHR_materials_emissive_strength: { emissiveStrength: 2.5 },
    KHR_materials_ior: { ior: 1.45 },
    KHR_materials_iridescence: { iridescenceFactor: 0.7, iridescenceIor: 1.35 },
    KHR_materials_sheen: { sheenColorFactor: [0.3, 0.2, 0.1], sheenRoughnessFactor: 0.45 },
    KHR_materials_specular: { specularFactor: 0.85, specularColorFactor: [1.2, 0.9, 0.7] },
  },
};
// 期待: 10拡張すべてが残り、specularColorFactor[0] === 1.2（クランプされない）。
// unlit 単独のケースと、transmission を欠いた volume が
// "gltf-material-extension-dependency-unmet" 警告付きで落ちるケースも追加する。
```
8. `pnpm cli:test` を通す。parity fixture はまだ通る（両実装が併存しているため）。

**コミット3 — 旧コード削除**

9. `applyMaterialExtensionsPatchLegacy` / `cloneMaterialExtensionsLegacy` / `cloneIridescence` / `material-extension-parity.fixture.ts` を削除し、`cli/convert.fixture.mjs` の登録も外す。
10. `pnpm cli:test && pnpm typecheck`。

### 期待される削減

| ファイル | 現在 | 後 |
|---|---|---|
| `asset-manifest.ts` L1321–1846 | 526 行 | 約 120 行 |
| `gltf-derived-assets.ts` L675–747 | 73 行 | 約 95 行（ただし 11 拡張すべて対応。従来は 5 拡張で 73 行） |
| `serialization.ts` L483–880（任意ステップ） | 約 400 行 | 約 90 行 |
| 新規 `material-extension-registry.ts` | — | 約 200 行 |
| **正味** | | **約 −700 行、かつ B2 が構造的に再発不能** |

---

## B-5. 承認が必要な behavior deltas（Task B）

| # | 内容 | 判断 |
|---|---|---|
| **E-1** | **glTF 取込で sheen / specular / volume / iridescence / anisotropy / dispersion が保存されるようになる**（B2 の恒久修正）。既存プロジェクトを再取込すると Material の見た目が変わる可能性がある | 修正の本体。承認必須 |
| **E-2** | glTF の `specularColorFactor` が 0–1 にクランプされなくなり、HDR 値がそのまま入る | glTF 仕様準拠。承認推奨 |
| **E-3** | glTF に `KHR_materials_volume` があって `KHR_materials_transmission` が無い場合、volume を**破棄して警告**する（そのまま入れると manifest が `extension-dependency` で保存不能になるため）。`KHR_materials_unlit` と他拡張が同居する場合は unlit を優先し他を破棄 | 代替案は transmission を `transmissionFactor: 0` で合成すること。要判断 |
| **E-4** | `cloneMaterialExtensions` が TextureInfo の `transform` を深くコピーするようになる（従来は参照共有＝潜在的な相互汚染） | バグ修正扱い |
| **E-5** | 新規警告コード `gltf-material-extension-dependency-unmet` / `gltf-material-extension-unlit-conflict` が追加される。診断 UI 側の未知コード扱いを確認すること | 要確認 |
| **E-6** | （serialization も同時にやる場合）依存エラーメッセージ文字列は完全一致を維持する。classic importer が message を正規表現でパースしているため | 実装時の必須制約 |