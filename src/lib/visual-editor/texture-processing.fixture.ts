import {
  normalizeTextureImportSettings,
  type TextureAsset,
  type TextureImportSettingsPatch,
  type TextureSourceFormat,
} from "./asset-manifest";
import {
  fitWithin,
  planTextureProcessing,
  processedAssetPath,
  resolveOutputFormat,
} from "./texture-processing";

/** Canvasを触らずに、変換の可否と変換後の見積もりだけを確かめる。 */
export function runTextureProcessingFixtureAssertions(): void {
  assertFitWithin();
  assertOutputFormats();
  assertUnsupportedSources();
  assertPendingDetection();
  assertProcessedPath();
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
  const asset: TextureAsset = {
    id: "texture-processing-fixture",
    name: "Texture Processing Fixture",
    kind: "texture",
    status: "ready",
    source: {
      kind: "project",
      relativePath: "assets/textures/texture-processing-fixture.png",
    },
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
  return planTextureProcessing(asset);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
