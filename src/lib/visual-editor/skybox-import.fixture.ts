import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  isEnvironmentTextureAsset,
  updateAssetThumbnail,
  updateTextureAsset,
  type AssetManifest,
} from "./asset-manifest";
import {
  classifyAssetImport,
  commitAssetImportPlan,
  createAssetImportPlan,
} from "./asset-import";
import { applyExternalStoreInstall } from "./external-store";
import {
  ENVIRONMENT_TEXTURE_THUMBNAIL_RENDERER_VERSION,
  createEnvironmentTextureThumbnailSourceHash,
  environmentTextureThumbnailDerivedPath,
  environmentTextureThumbnailNeedsRefresh,
} from "./environment-texture-thumbnail";
import { assetManifestCodec } from "./serialization";
import type { ExternalStoreInstallResult } from "../tauri";

/** Filesystem-free assertions for HDR/EXR import as environment Texture Assets. */
export async function runSkyboxImportFixtureAssertions(): Promise<void> {
  const hdrClassification = classifyAssetImport(
    "environment.hdr",
    "image/vnd.radiance",
  );
  assert(
    hdrClassification?.kind === "skybox" &&
      hdrClassification.format === "hdr",
    "HDR was not classified as a Skybox",
  );
  const exrClassification = classifyAssetImport(
    "environment.exr",
    "image/x-exr",
  );
  assert(
    exrClassification?.kind === "skybox" &&
      exrClassification.format === "exr",
    "EXR was not classified as a Skybox",
  );

  const hdrHeader = new TextEncoder().encode(
    "#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 1\n",
  );
  const hdrBytes = new Uint8Array(hdrHeader.byteLength + 4);
  hdrBytes.set(hdrHeader);
  hdrBytes.set([128, 128, 128, 128], hdrHeader.byteLength);
  const hdrPlan = await createAssetImportPlan({
    fileName: "environment.hdr",
    mimeType: "image/vnd.radiance",
    bytes: hdrBytes,
  });
  assert(hdrPlan.canCommit, "Valid HDR import plan was blocked");
  assert(
    isEnvironmentTextureAsset(hdrPlan.asset) &&
      hdrPlan.asset.importMetadata?.sourceFormat === "hdr" &&
      hdrPlan.asset.importSettings.flipY === false,
    "HDR did not create an editable HDR Texture Asset",
  );
  assertManagedSkyboxWrite(hdrPlan, "hdr", "image/vnd.radiance");

  const exrPlan = await createAssetImportPlan({
    fileName: "environment.exr",
    mimeType: "image/x-exr",
    bytes: new Uint8Array([0x76, 0x2f, 0x31, 0x01, 0x02, 0x00, 0x00, 0x00]),
  });
  assert(exrPlan.canCommit, "Valid EXR import plan was blocked");
  assert(
    isEnvironmentTextureAsset(exrPlan.asset) &&
      exrPlan.asset.importMetadata?.sourceFormat === "exr" &&
      exrPlan.asset.importSettings.flipY === false,
    "EXR did not create an editable EXR Texture Asset",
  );
  assertManagedSkyboxWrite(exrPlan, "exr", "image/x-exr");

  const emptyManifest: AssetManifest = {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: {},
  };
  const committed = await commitAssetImportPlan(
    emptyManifest,
    exrPlan,
    async () => undefined,
  );
  assert(
    exrPlan.asset &&
      isEnvironmentTextureAsset(committed.assets[exrPlan.asset.id]),
    "Committed Manifest is missing the EXR Texture Asset",
  );
  assert(
    assetManifestCodec.parse(assetManifestCodec.serialize(committed)).ok,
    "Committed EXR Texture does not pass Manifest validation",
  );
  const flipped = exrPlan.asset
    ? updateTextureAsset(committed, exrPlan.asset.id, {
        importSettings: { flipY: true },
      })
    : committed;
  const flippedAsset = exrPlan.asset
    ? flipped.assets[exrPlan.asset.id]
    : undefined;
  assert(
    isEnvironmentTextureAsset(flippedAsset) &&
      flippedAsset.importSettings.flipY,
    "Environment Texture Flip Y was not editable",
  );

  const migratedLegacy = assetManifestCodec.parse(
    assetManifestCodec.serialize({
      schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
      assets: {
        "legacy-skybox": {
          id: "legacy-skybox",
          name: "Legacy Skybox",
          kind: "skybox",
          status: "ready",
          source: {
            kind: "project",
            relativePath: "assets/imported/skyboxes/legacy/environment.hdr",
          },
          projection: "equirectangular",
          sourceFormat: "hdr",
          byteLength: 512,
        },
      },
    }),
  );
  assert(
    migratedLegacy.ok &&
      isEnvironmentTextureAsset(migratedLegacy.document.assets["legacy-skybox"]) &&
      migratedLegacy.document.assets["legacy-skybox"].kind === "texture",
    "Legacy Skybox Asset was not migrated to an environment Texture Asset",
  );

  const externalExr: ExternalStoreInstallResult = {
    providerId: "poly-haven",
    providerName: "Poly Haven",
    externalId: "noon_grass",
    name: "Noon Grass",
    assetKind: "hdri",
    resolution: "1k",
    files: [
      {
        role: "environment",
        relativePath:
          "assets/imported/external/poly-haven/noon_grass/noon_grass_environment_1k.exr",
        byteLength: 1024,
        sha256: "fixture-external-exr-sha256",
        format: "exr",
      },
    ],
    authors: ["Poly Haven contributor"],
    assetUrl: "https://polyhaven.com/a/noon_grass",
    licenseName: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  };
  const appliedExternal = applyExternalStoreInstall(emptyManifest, externalExr);
  const externalAsset =
    appliedExternal.manifest.assets[appliedExternal.primaryAssetId];
  assert(
    appliedExternal.kind === "skybox" &&
      isEnvironmentTextureAsset(externalAsset) &&
      externalAsset.importMetadata?.sourceFormat === "exr" &&
      externalAsset.importSettings.flipY === false,
    "External EXR was not installed as an editable EXR Texture Asset",
  );
  if (!isEnvironmentTextureAsset(externalAsset)) {
    throw new Error("External environment Texture fixture was not created");
  }
  const previewSourceHash =
    await createEnvironmentTextureThumbnailSourceHash(externalAsset);
  assert(
    environmentTextureThumbnailNeedsRefresh(externalAsset, previewSourceHash),
    "An external HDRI without a thumbnail was not queued for preview generation",
  );
  assert(
    environmentTextureThumbnailDerivedPath(
      externalAsset.id,
      previewSourceHash,
    ).startsWith("assets/.derived/thumbnails/"),
    "The HDRI preview was not assigned a managed derived path",
  );

  const externalModel: ExternalStoreInstallResult = {
    providerId: "poly-haven",
    providerName: "Poly Haven",
    externalId: "arm_chair_01",
    name: "Arm Chair 01",
    assetKind: "model",
    resolution: "2k",
    files: [
      {
        role: "model",
        relativePath:
          "assets/imported/external/poly-haven/arm_chair_01/arm_chair_01_model_2k.gltf",
        byteLength: 4096,
        sha256: "fixture-external-model-sha256",
        format: "gltf",
      },
    ],
    authors: ["Poly Haven contributor"],
    assetUrl: "https://polyhaven.com/a/arm_chair_01",
    licenseName: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  };
  const appliedModel = applyExternalStoreInstall(emptyManifest, externalModel);
  const modelAsset = appliedModel.manifest.assets[appliedModel.primaryAssetId];
  assert(
    appliedModel.kind === "model" &&
      modelAsset?.kind === "model" &&
      modelAsset.source.kind === "project" &&
      modelAsset.source.relativePath.endsWith(".gltf"),
    "External model was not installed as a project-relative Model Asset",
  );
  const externalWithPreview = updateAssetThumbnail(
    appliedExternal.manifest,
    externalAsset.id,
    {
      status: "generated",
      derivedPath: environmentTextureThumbnailDerivedPath(
        externalAsset.id,
        previewSourceHash,
      ),
      sourceHash: previewSourceHash,
      rendererVersion: ENVIRONMENT_TEXTURE_THUMBNAIL_RENDERER_VERSION,
    },
  );
  const externalFlipped = updateTextureAsset(
    externalWithPreview,
    externalAsset.id,
    { importSettings: { flipY: true } },
  );
  const flippedExternalAsset = externalFlipped.assets[externalAsset.id];
  assert(
    isEnvironmentTextureAsset(flippedExternalAsset) &&
      flippedExternalAsset.thumbnail?.status === "stale",
    "Changing HDRI Flip Y did not invalidate its generated preview",
  );
  if (!isEnvironmentTextureAsset(flippedExternalAsset)) {
    throw new Error("Flipped external environment Texture fixture was lost");
  }
  const flippedPreviewSourceHash =
    await createEnvironmentTextureThumbnailSourceHash(flippedExternalAsset);
  assert(
    flippedPreviewSourceHash !== previewSourceHash &&
      environmentTextureThumbnailNeedsRefresh(
        flippedExternalAsset,
        flippedPreviewSourceHash,
      ),
    "Changing HDRI Flip Y did not queue a matching preview regeneration",
  );

  for (const [fileName, mimeType] of [
    ["broken.hdr", "image/vnd.radiance"],
    ["broken.exr", "image/x-exr"],
  ] as const) {
    const invalidPlan = await createAssetImportPlan({
      fileName,
      mimeType,
      bytes: new TextEncoder().encode("<!doctype html>"),
    });
    assert(
      !invalidPlan.canCommit &&
        invalidPlan.diagnostics.some(
          (diagnostic) => diagnostic.code === "hdri-signature-invalid",
        ),
      `${fileName} accepted a non-HDRI payload`,
    );
  }

  const truncatedHdrPlan = await createAssetImportPlan({
    fileName: "truncated.hdr",
    mimeType: "image/vnd.radiance",
    bytes: hdrHeader,
  });
  assert(
    !truncatedHdrPlan.canCommit,
    "An HDR header without pixel data was accepted",
  );
}

function assertManagedSkyboxWrite(
  plan: Awaited<ReturnType<typeof createAssetImportPlan>>,
  extension: "hdr" | "exr",
  mediaType: "image/vnd.radiance" | "image/x-exr",
): void {
  assert(
    plan.asset?.source.kind === "project" &&
      plan.asset.source.relativePath.startsWith("assets/imported/textures/") &&
      plan.asset.source.relativePath.endsWith(`/environment.${extension}`),
    `${extension.toUpperCase()} source was not assigned a managed Texture path`,
  );
  assert(
    plan.writes.length === 1 &&
      plan.writes[0].purpose === "source" &&
      plan.writes[0].mediaType === mediaType,
    `${extension.toUpperCase()} import did not retain its source write`,
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Skybox import fixture failed: ${message}`);
}
