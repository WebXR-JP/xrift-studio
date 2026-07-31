import type { ScriptAssetRuntimeDescriptor } from "../../../../packages/xrift-studio-runtime/src/script/api";

import {
  normalizeTextureImportSettings,
  type AssetManifest,
} from "../asset-manifest";

export type { ScriptAssetRuntimeDescriptor } from "../../../../packages/xrift-studio-runtime/src/script/api";

/**
 * Builds the portable Asset descriptor consumed by both Studio Play and the
 * statically emitted Script host.
 *
 * Resize and compression are import-pipeline concerns: the resolved URL
 * already points at their output. Runtime texture behavior is therefore
 * limited to the sampler, color-space, orientation, and mipmap settings.
 */
export function createScriptAssetRuntimeDescriptor(
  manifest: AssetManifest,
  assetId: string,
  url: string,
): ScriptAssetRuntimeDescriptor | null {
  const asset = manifest.assets[assetId];
  if (!asset || !url) return null;
  if (asset.kind !== "texture") return { url };

  const settings = normalizeTextureImportSettings(asset.importSettings);
  return {
    url,
    textureDefaults: {
      colorSpace: settings.colorSpace,
      wrapS: settings.sampler.wrapS,
      wrapT: settings.sampler.wrapT,
      magFilter: settings.sampler.magFilter,
      minFilter: settings.sampler.minFilter,
      flipY: settings.flipY,
      generateMipmaps: settings.generateMipmaps,
    },
  };
}

/** Stable descriptor order, independent of Set/Manifest insertion order. */
export function createScriptAssetRuntimeDescriptorMap(
  manifest: AssetManifest,
  assetIds: Iterable<string>,
  resolveUrl: (assetId: string) => string | null | undefined,
): Map<string, ScriptAssetRuntimeDescriptor> {
  const descriptors = new Map<string, ScriptAssetRuntimeDescriptor>();
  for (const assetId of [...new Set(assetIds)].sort()) {
    const url = resolveUrl(assetId);
    if (!url) continue;
    const descriptor = createScriptAssetRuntimeDescriptor(
      manifest,
      assetId,
      url,
    );
    if (descriptor) descriptors.set(assetId, descriptor);
  }
  return descriptors;
}

/** Used to advance only the per-Asset revisions whose runtime behavior changed. */
export function scriptAssetRuntimeDescriptorKey(
  descriptor: ScriptAssetRuntimeDescriptor | null | undefined,
): string | null {
  if (!descriptor) return null;
  const defaults = descriptor.textureDefaults;
  return JSON.stringify(
    defaults
      ? [
          descriptor.url,
          defaults.colorSpace ?? null,
          defaults.wrapS ?? null,
          defaults.wrapT ?? null,
          defaults.magFilter ?? null,
          defaults.minFilter ?? null,
          defaults.flipY ?? null,
          defaults.generateMipmaps ?? null,
        ]
      : [descriptor.url],
  );
}

export function advanceScriptAssetRuntimeDescriptorVersions(
  previousDescriptors: ReadonlyMap<string, ScriptAssetRuntimeDescriptor>,
  previousVersions: ReadonlyMap<string, number>,
  nextDescriptors: ReadonlyMap<string, ScriptAssetRuntimeDescriptor>,
): Map<string, number> {
  const versions = new Map<string, number>();
  for (const [assetId, descriptor] of nextDescriptors) {
    const previousVersion = previousVersions.get(assetId) ?? 0;
    const unchanged =
      scriptAssetRuntimeDescriptorKey(previousDescriptors.get(assetId)) ===
      scriptAssetRuntimeDescriptorKey(descriptor);
    versions.set(
      assetId,
      unchanged ? Math.max(1, previousVersion) : previousVersion + 1,
    );
  }
  return versions;
}

/** A host depends only on the Assets explicitly declared on its Component. */
export function createScriptAssetResolutionKey(
  assetIds: Iterable<string>,
  descriptorVersions: ReadonlyMap<string, number>,
): string {
  return JSON.stringify(
    [...new Set(assetIds)]
      .sort()
      .map((assetId) => [
        assetId,
        descriptorVersions.get(assetId) ?? null,
      ]),
  );
}

/**
 * Synchronous document key used to decide when Play should re-resolve URLs.
 * Binary reimports are represented by sourceHash. Runtime defaults affect the
 * descriptor directly; resize/compression recipes only schedule URL
 * re-resolution so they restart a host if their processed bytes actually
 * change.
 */
export function createScriptAssetRuntimeInputKey(
  manifest: AssetManifest,
  assetIds: Iterable<string>,
): string {
  return JSON.stringify(
    [...new Set(assetIds)].sort().map((assetId) => {
      const asset = manifest.assets[assetId];
      if (!asset) return [assetId, null];
      const source =
        asset.source.kind === "project"
          ? ["project", asset.source.relativePath]
          : asset.source.kind === "builtin"
            ? ["builtin", asset.source.key]
            : ["document"];
      const textureSettings =
        asset.kind === "texture"
          ? normalizeTextureImportSettings(asset.importSettings)
          : null;
      const textureDefaults =
        textureSettings
          ? createScriptAssetRuntimeDescriptor(
              manifest,
              assetId,
              "manifest-key",
            )?.textureDefaults ?? null
          : null;
      const importOutputSettings =
        textureSettings
          ? [
              textureSettings.resize.mode,
              textureSettings.resize.mode === "max-size"
                ? textureSettings.resize.maxSize
                : null,
              textureSettings.compression.format,
              textureSettings.compression.quality,
            ]
          : null;
      return [
        assetId,
        asset.kind,
        asset.status,
        source,
        asset.sourceHash ?? null,
        textureDefaults
          ? [
              textureDefaults.colorSpace ?? null,
              textureDefaults.wrapS ?? null,
              textureDefaults.wrapT ?? null,
              textureDefaults.magFilter ?? null,
              textureDefaults.minFilter ?? null,
              textureDefaults.flipY ?? null,
              textureDefaults.generateMipmaps ?? null,
            ]
          : null,
        importOutputSettings,
      ];
    }),
  );
}
