import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  normalizeTextureImportSettings,
  type TextureAsset,
  type TextureImportSettingsPatch,
  type TextureSourceFormat,
} from "./asset-manifest";
import {
  describeTextureOptimization,
  fitWithin,
  isPublishedAsKtx2,
  ktx2QualityLevel,
  nearestPowerOfTwo,
  planTextureConversion,
  planTextureProcessing,
  textureProcessingSource,
  textureProcessingSettings,
  processedAssetPath,
  resolveOutputFormat,
  resolveTargetSize,
  revertTextureOptimization,
  summarizeTexturePublishConversions,
} from "./texture-processing";

/** Canvasを触らずに、変換の可否と変換後の見積もりだけを確かめる。 */
export function runTextureProcessingFixtureAssertions(): void {
  assertFitWithin();
  assertOutputFormats();
  assertUnsupportedSources();
  assertPendingDetection();
  assertProcessedPath();
  assertKtx2Quality();
  assertPowerOfTwo();
  assertNonDestructiveRevert();
  assertPublishConversion();
  assertOptimizedReprocessing();
}

function assertOptimizedReprocessing(): void {
  const original = textureAsset({ sourceFormat: "jpeg", width: 4096, height: 2048 }, { resize: { mode: "max-size", maxSize: 1024 }, compression: { format: "ktx2" } });
  const optimized = textureAsset({ sourceFormat: "ktx2", width: 1024, height: 512 }, {}, {
    source: { kind: "project", relativePath: "assets/.optimized/test.ktx2" },
    optimizedFrom: { source: original.source, sourceHash: original.sourceHash, importMetadata: original.importMetadata, importSettings: original.importSettings, appliedAt: "2026-08-31T00:00:00Z" },
  });
  const settled = planTextureProcessing(optimized);
  assert(settled.supported && !settled.pending, "An optimized KTX2 with a retained original must be settled, not unsupported");
  const changed = { ...optimized, importSettings: normalizeTextureImportSettings({ resize: { mode: "max-size", maxSize: 2048 }, compression: { format: "ktx2" } }) };
  const plan = planTextureProcessing(changed);
  assert(plan.supported && plan.pending && plan.targetWidth === 2048 && plan.targetHeight === 1024, "Reprocessing must recover detail from the original, not upscale KTX2");
  assert(textureProcessingSource(changed).source === original.source, "Reprocessing read the optimized file");
  const unchanged = planTextureProcessing({ ...optimized, importSettings: original.importSettings });
  assert(unchanged.supported && !unchanged.pending, "An already applied recipe was re-encoded");
  const legacy = { ...optimized, optimizedFrom: { ...optimized.optimizedFrom!, importSettings: normalizeTextureImportSettings() } };
  const legacySettings = textureProcessingSettings(legacy);
  assert(legacySettings.compression.format === "ktx2" && legacySettings.resize.mode === "max-size" && legacySettings.resize.maxSize === 1024, "Legacy Optimize lost its actual output format and size");
  const legacyPlan = planTextureProcessing({ ...legacy, importSettings: legacySettings });
  assert(legacyPlan.supported && !legacyPlan.pending, "Legacy optimized output was unnecessarily re-encoded");
}

/**
 * 未反映のImport設定は、原本を書き換えずに公開時へ持ち越せる必要がある。
 * ここが壊れると、作者は公開のたびに原本の書き出しを強いられる。
 */
function assertPublishConversion(): void {
  const settled = textureAsset(
    { sourceFormat: "png", width: 1024, height: 1024 },
    { resize: { mode: "original" }, compression: { format: "source" } },
  );
  assert(
    planTextureConversion(settled) === null,
    "A settled Texture recipe must not schedule a publish-time conversion",
  );
  assert(
    !isPublishedAsKtx2(settled),
    "A PNG Texture without a recipe must not be published as KTX2",
  );

  const pending = textureAsset(
    { sourceFormat: "png", width: 4096, height: 4096 },
    {
      colorSpace: "srgb",
      resize: { mode: "max-size", maxSize: 1024 },
      compression: { format: "ktx2", quality: 80 },
    },
  );
  const conversion = planTextureConversion(pending);
  assert(
    conversion?.outputFormat === "ktx2" &&
      conversion.extension === "ktx2" &&
      conversion.mimeType === "image/ktx2" &&
      conversion.maxSize === 1024 &&
      conversion.quality === 80 &&
      conversion.srgb,
    "An unapplied Texture recipe did not produce a publish-time conversion",
  );
  assert(
    isPublishedAsKtx2(pending),
    "A Texture converted to KTX2 at publish time was not reported as KTX2",
  );

  // すでに最大解像度へ収まっている原本は、作り直しても同じ絵にしかならない。
  const alreadyFitting = textureAsset(
    { sourceFormat: "png", width: 512, height: 512 },
    { resize: { mode: "max-size", maxSize: 1024 }, compression: { format: "source" } },
  );
  assert(
    planTextureConversion(alreadyFitting) === null,
    "A source already within the max size must not be re-encoded",
  );

  // Canvasで描き直せない原本は設定を反映できない。公開は原本のまま続ける。
  const unconvertible = textureAsset(
    { sourceFormat: "svg", width: undefined, height: undefined },
    { resize: { mode: "max-size", maxSize: 512 }, compression: { format: "source" } },
    { source: { kind: "project", relativePath: "assets/imported/textures/logo.svg" } },
  );
  assert(
    planTextureConversion(unconvertible) === null,
    "An SVG source must not be scheduled for conversion",
  );

  const summary = summarizeTexturePublishConversions({
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: {
      [settled.id]: settled,
      "texture-pending": { ...pending, id: "texture-pending", name: "Pending" },
      "texture-unconvertible": {
        ...unconvertible,
        id: "texture-unconvertible",
        name: "Logo",
      },
    },
  });
  assert(
    summary.converted.length === 1 &&
      summary.converted[0].assetId === "texture-pending" &&
      summary.converted[0].from === "4096 × 4096・PNG" &&
      summary.converted[0].to === "1024 × 1024・KTX2",
    "The publish conversion summary did not describe the converted Texture",
  );
  assert(
    summary.ignored.length === 1 && summary.ignored[0].assetId === "texture-unconvertible",
    "The publish conversion summary did not report the unapplicable recipe",
  );
}

/**
 * 2のべき乗への丸めは最大解像度と併用できる必要がある。上限を超える丸め上げは
 * Canvasが描けない辺を作るので、必ず上限側で止まることを固定する。
 */
function assertPowerOfTwo(): void {
  assert(
    nearestPowerOfTwo(1000, null) === 1024 && nearestPowerOfTwo(600, null) === 512,
    "A non power-of-two edge did not snap to the nearest power of two",
  );
  assert(
    nearestPowerOfTwo(1024, null) === 1024,
    "An edge that is already a power of two was changed",
  );
  assert(
    nearestPowerOfTwo(1800, 1024) === 1024,
    "Snapping ignored the max size ceiling",
  );
  assert(
    nearestPowerOfTwo(1, null) === 1 && nearestPowerOfTwo(0, null) === 1,
    "A degenerate edge collapsed below one pixel",
  );
  assert(
    nearestPowerOfTwo(20000, null) === 8192,
    "Snapping produced an edge past the renderable ceiling",
  );

  const both = resolveTargetSize(4000, 3000, 1024, true);
  assert(
    both.width === 1024 && both.height === 1024,
    `Max size and power-of-two did not compose: ${both.width} × ${both.height}`,
  );
  const potOnly = resolveTargetSize(1000, 600, null, true);
  assert(
    potOnly.width === 1024 && potOnly.height === 512,
    "Power-of-two without a max size did not snap both edges",
  );
  const off = resolveTargetSize(1000, 600, null, false);
  assert(
    off.width === 1000 && off.height === 600,
    "Sizes changed while power-of-two was off",
  );

  // 最大解像度に収まっていても、辺が2のべき乗でなければ変換は必要。
  const pending = plan(
    { sourceFormat: "png", width: 1000, height: 600 },
    { resize: { mode: "original", powerOfTwo: true } },
  );
  assert(
    pending.supported &&
      pending.pending &&
      pending.powerOfTwo &&
      pending.targetWidth === 1024 &&
      pending.targetHeight === 512,
    "A power-of-two only recipe was not reported as pending",
  );
  const settled = plan(
    { sourceFormat: "png", width: 1024, height: 512 },
    { resize: { mode: "original", powerOfTwo: true } },
  );
  assert(
    settled.supported && !settled.pending,
    "A source that is already power-of-two was reported as pending",
  );
}

/**
 * 圧縮しても原本は消さない。参照先だけを差し替え、控えから必ず戻せる。
 * ここが壊れると、作者は変換をやり直す手段を失う。
 */
function assertNonDestructiveRevert(): void {
  const original = textureAsset(
    { sourceFormat: "png", width: 2048, height: 2048 },
    { compression: { format: "ktx2" } },
  );
  assert(
    !describeTextureOptimization(original).optimized,
    "An untouched Texture was reported as optimized",
  );

  const optimized: TextureAsset = {
    ...original,
    source: { kind: "project", relativePath: "assets/.optimized/t-abc.ktx2" },
    sourceHash: "b".repeat(64),
    importMetadata: {
      sourceFormat: "ktx2",
      mimeType: "image/ktx2",
      byteLength: 1024,
      width: 1024,
      height: 1024,
    },
    importSettings: normalizeTextureImportSettings(
      { compression: { format: "source" } },
      normalizeTextureImportSettings(
        original.importSettings as unknown as TextureImportSettingsPatch,
      ),
    ),
    optimizedFrom: {
      source: original.source,
      sourceHash: original.sourceHash,
      importMetadata: original.importMetadata,
      importSettings: original.importSettings,
      appliedAt: "2026-01-01T00:00:00.000Z",
    },
  };

  const status = describeTextureOptimization(optimized);
  assert(
    status.optimized &&
      status.current.label === "1024 × 1024・KTX2" &&
      status.original.label === "2048 × 2048・PNG",
    "The in-use and original variants were not described for the author",
  );

  const manifest = {
    assets: { [optimized.id]: optimized },
  } as unknown as Parameters<typeof revertTextureOptimization>[0];
  const reverted = revertTextureOptimization(manifest, optimized.id);
  assert(reverted.ok, "Reverting a converted Texture failed");
  if (!reverted.ok) return;
  const restored = reverted.manifest.assets[optimized.id];
  assert(
    restored.kind === "texture" &&
      restored.source.kind === "project" &&
      restored.source.relativePath === "assets/imported/textures/fixture.png" &&
      restored.importMetadata?.sourceFormat === "png" &&
      restored.importSettings.compression.format === "ktx2" &&
      restored.optimizedFrom === undefined,
    "Reverting did not restore the original source, metadata and recipe",
  );

  const alreadyOriginal = revertTextureOptimization(reverted.manifest, optimized.id);
  assert(
    !alreadyOriginal.ok,
    "Reverting an Asset that already uses its original was accepted",
  );
}

/**
 * Basisのquality levelは 1..255 の探索量で、Import設定の 0..100 とは別の尺度。
 * 0や範囲外を渡すとエンコーダが失敗するので、境界を固定しておく。
 */
function assertKtx2Quality(): void {
  assert(ktx2QualityLevel(0) === 1, "The lowest quality mapped outside the Basis range");
  assert(ktx2QualityLevel(100) === 255, "The highest quality did not reach the Basis maximum");
  assert(
    ktx2QualityLevel(50) > 1 && ktx2QualityLevel(50) < 255,
    "A mid quality did not stay inside the Basis range",
  );
  assert(
    ktx2QualityLevel(-40) === 1 && ktx2QualityLevel(400) === 255,
    "An out-of-range quality was not clamped",
  );
  assert(
    ktx2QualityLevel(Number.NaN) === 255,
    "A non-numeric quality did not fall back to the maximum",
  );
  assert(
    ktx2QualityLevel(70) >= ktx2QualityLevel(40),
    "The Basis quality mapping is not monotonic",
  );
}

function assertFitWithin(): void {
  const landscape = fitWithin(4096, 2048, 1024);
  assert(
    landscape.width === 1024 && landscape.height === 512,
    "Landscape texture was not fitted to the requested max size",
  );
  const portrait = fitWithin(512, 2048, 1024);
  assert(
    portrait.width === 256 && portrait.height === 1024,
    "Portrait texture was not fitted along its longest edge",
  );
  const smaller = fitWithin(256, 128, 1024);
  assert(
    smaller.width === 256 && smaller.height === 128,
    "A texture smaller than the max size was upscaled",
  );
  const unbounded = fitWithin(4096, 2048, null);
  assert(
    unbounded.width === 4096 && unbounded.height === 2048,
    "A texture without a max size was resized",
  );
  const tiny = fitWithin(3, 1, 2);
  assert(tiny.width === 2 && tiny.height === 1, "Fitting collapsed an axis to zero");
}

function assertOutputFormats(): void {
  assert(
    resolveOutputFormat("png", "source") === "png" &&
      resolveOutputFormat("jpeg", "source") === "jpeg" &&
      resolveOutputFormat("webp", "source") === "webp",
    "A Canvas-encodable source format was not preserved",
  );
  assert(
    resolveOutputFormat("gif", "source") === "webp" &&
      resolveOutputFormat("avif", "source") === "webp" &&
      resolveOutputFormat("bmp", "source") === "webp",
    "A source format Canvas cannot write back did not fall back to WEBP",
  );
  assert(
    resolveOutputFormat("png", "webp") === "webp" &&
      resolveOutputFormat("png", "ktx2") === "ktx2",
    "An explicit compression format was ignored",
  );
}

function assertUnsupportedSources(): void {
  const builtin = plan(
    { sourceFormat: "png", width: 4096, height: 4096 },
    { resize: { mode: "max-size", maxSize: 1024 } },
    { source: { kind: "builtin", key: "starter/grid" } },
  );
  assert(!builtin.supported, "A built-in Texture source was offered for conversion");

  const missing = plan(
    { sourceFormat: "png", width: 4096, height: 4096 },
    { resize: { mode: "max-size", maxSize: 1024 } },
    { status: "missing" },
  );
  assert(!missing.supported, "A missing Texture was offered for conversion");

  const environment = plan(
    { sourceFormat: "hdr", width: 4096, height: 2048 },
    { resize: { mode: "max-size", maxSize: 1024 } },
    { usage: "environment" },
  );
  assert(!environment.supported, "An environment Texture was offered for conversion");

  const ktx2 = plan(
    { sourceFormat: "ktx2", width: 2048, height: 2048 },
    { resize: { mode: "max-size", maxSize: 1024 } },
  );
  assert(!ktx2.supported, "An already compressed KTX2 Texture was offered for conversion");

  const svg = plan(
    { sourceFormat: "svg", width: 1024, height: 1024 },
    { compression: { format: "webp" } },
  );
  assert(!svg.supported, "A vector Texture was offered for conversion");

  const unanalyzed = plan(null, { resize: { mode: "max-size", maxSize: 1024 } });
  assert(
    !unanalyzed.supported,
    "A Texture without import metadata was offered for conversion",
  );
}

function assertPendingDetection(): void {
  const untouched = plan({ sourceFormat: "png", width: 512, height: 512 }, {});
  assert(
    untouched.supported && !untouched.pending && untouched.settledReason !== null,
    "Default Import settings were reported as a pending conversion",
  );

  const alreadySmall = plan(
    { sourceFormat: "png", width: 512, height: 512 },
    { resize: { mode: "max-size", maxSize: 1024 } },
  );
  assert(
    alreadySmall.supported && !alreadySmall.pending,
    "A Texture already within the max size was reported as pending",
  );

  const oversized = plan(
    { sourceFormat: "png", width: 4096, height: 2048 },
    { resize: { mode: "max-size", maxSize: 1024 } },
  );
  assert(
    oversized.supported &&
      oversized.pending &&
      oversized.targetWidth === 1024 &&
      oversized.targetHeight === 512 &&
      oversized.outputFormat === "png" &&
      !oversized.qualityApplies,
    "An oversized PNG was not planned as a lossless resize",
  );

  const compressed = plan(
    { sourceFormat: "png", width: 512, height: 512 },
    { compression: { format: "webp", quality: 60 } },
  );
  assert(
    compressed.supported &&
      compressed.pending &&
      compressed.outputFormat === "webp" &&
      compressed.qualityApplies &&
      compressed.quality === 60,
    "A compression-only change was not planned as a pending conversion",
  );

  const unknownSize = plan(
    { sourceFormat: "jpeg", width: undefined, height: undefined },
    { resize: { mode: "max-size", maxSize: 1024 } },
  );
  assert(
    unknownSize.supported &&
      unknownSize.pending &&
      unknownSize.targetWidth === null,
    "A Texture with unknown dimensions did not fall back to running the conversion",
  );

  const ktx2 = plan(
    { sourceFormat: "png", width: 1024, height: 1024 },
    { compression: { format: "ktx2", quality: 80 } },
  );
  assert(
    ktx2.supported &&
      ktx2.pending &&
      ktx2.outputFormat === "ktx2" &&
      ktx2.qualityApplies,
    "A KTX2 conversion did not report Quality as meaningful",
  );

  const substituted = plan(
    { sourceFormat: "gif", width: 2048, height: 2048 },
    { resize: { mode: "max-size", maxSize: 512 } },
  );
  assert(
    substituted.supported &&
      substituted.pending &&
      substituted.outputFormat === "webp" &&
      substituted.outputFormatSubstituted,
    "A GIF resize did not report that the output format changes",
  );
}

function assertProcessedPath(): void {
  const path = processedAssetPath("texture/../weird id", "a".repeat(64), "webp");
  assert(
    path === `assets/.optimized/texture-weird-id-${"a".repeat(16)}.webp`,
    `Processed Texture path was not sanitized: ${path}`,
  );
}

function plan(
  metadata:
    | {
        sourceFormat: TextureSourceFormat;
        width: number | undefined;
        height: number | undefined;
      }
    | null,
  settings: TextureImportSettingsPatch,
  overrides: Partial<TextureAsset> = {},
): ReturnType<typeof planTextureProcessing> {
  return planTextureProcessing(textureAsset(metadata, settings, overrides));
}

function textureAsset(
  metadata:
    | {
        sourceFormat: TextureSourceFormat;
        width: number | undefined;
        height: number | undefined;
      }
    | null,
  settings: TextureImportSettingsPatch,
  overrides: Partial<TextureAsset> = {},
): TextureAsset {
  return {
    id: "texture-processing-fixture",
    name: "Texture Processing Fixture",
    kind: "texture",
    status: "ready",
    source: {
      kind: "project",
      relativePath: "assets/imported/textures/fixture.png",
    },
    sourceHash: "a".repeat(64),
    thumbnail: { status: "missing" },
    importSettings: normalizeTextureImportSettings(settings),
    ...(metadata
      ? {
          importMetadata: {
            sourceFormat: metadata.sourceFormat,
            mimeType: `image/${metadata.sourceFormat}`,
            byteLength: 1024 * 1024,
            width: metadata.width,
            height: metadata.height,
          },
        }
      : {}),
    ...overrides,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
