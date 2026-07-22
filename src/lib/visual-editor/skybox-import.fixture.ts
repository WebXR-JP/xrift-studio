import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  type AssetManifest,
} from "./asset-manifest";
import {
  classifyAssetImport,
  commitAssetImportPlan,
  createAssetImportPlan,
} from "./asset-import";
import { applyExternalStoreInstall } from "./external-store";
import { assetManifestCodec } from "./serialization";
import type { ExternalStoreInstallResult } from "../tauri";

/** Filesystem-free assertions for HDR/EXR import and Skybox Asset creation. */
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
    hdrPlan.asset?.kind === "skybox" &&
      hdrPlan.asset.sourceFormat === "hdr",
    "HDR did not create an HDR Skybox Asset",
  );
  assertManagedSkyboxWrite(hdrPlan, "hdr", "image/vnd.radiance");

  const exrPlan = await createAssetImportPlan({
    fileName: "environment.exr",
    mimeType: "image/x-exr",
    bytes: new Uint8Array([0x76, 0x2f, 0x31, 0x01, 0x02, 0x00, 0x00, 0x00]),
  });
  assert(exrPlan.canCommit, "Valid EXR import plan was blocked");
  assert(
    exrPlan.asset?.kind === "skybox" &&
      exrPlan.asset.sourceFormat === "exr",
    "EXR did not create an EXR Skybox Asset",
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
    exrPlan.asset && committed.assets[exrPlan.asset.id]?.kind === "skybox",
    "Committed Manifest is missing the EXR Skybox Asset",
  );
  assert(
    assetManifestCodec.parse(assetManifestCodec.serialize(committed)).ok,
    "Committed EXR Skybox does not pass Manifest validation",
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
      externalAsset?.kind === "skybox" &&
      externalAsset.sourceFormat === "exr",
    "External EXR was not installed as an EXR Skybox Asset",
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
      plan.asset.source.relativePath.startsWith("assets/imported/skyboxes/") &&
      plan.asset.source.relativePath.endsWith(`/environment.${extension}`),
    `${extension.toUpperCase()} source was not assigned a managed Skybox path`,
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
