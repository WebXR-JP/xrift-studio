import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  type AssetManifest,
} from "./asset-manifest";
import {
  classifyAssetImport,
  commitAssetImportPlan,
  createAssetImportPlan,
} from "./asset-import";
import { assetManifestCodec } from "./serialization";

/** Filesystem-free assertions for MP3 import, Manifest commit, and validation. */
export async function runAudioImportFixtureAssertions(): Promise<void> {
  const classification = classifyAssetImport("ambient.mp3", "audio/mpeg");
  assert(
    classification?.kind === "audio" && classification.format === "mp3",
    "MP3 was not classified as Audio",
  );

  const bytes = new Uint8Array([
    0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  const plan = await createAssetImportPlan({
    fileName: "ambient.mp3",
    mimeType: "audio/mpeg",
    bytes,
  });
  assert(plan.canCommit, "Valid MP3 import plan was blocked");
  assert(plan.asset?.kind === "audio", "MP3 did not create an Audio Asset");
  assert(
    plan.asset?.source.kind === "project" &&
      plan.asset.source.relativePath.startsWith("assets/imported/audio/") &&
      plan.asset.source.relativePath.endsWith("/ambient.mp3"),
    "Audio source was not assigned a managed project-relative path",
  );
  assert(
    plan.writes.length === 1 &&
      plan.writes[0].purpose === "source" &&
      plan.writes[0].mediaType === "audio/mpeg",
    "Audio import did not retain the MP3 source write",
  );

  const emptyManifest: AssetManifest = {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: {},
  };
  let committedWriteCount = 0;
  const committed = await commitAssetImportPlan(
    emptyManifest,
    plan,
    async (request) => {
      committedWriteCount = request.writes.length;
    },
  );
  assert(committedWriteCount === 1, "Audio source was not atomically committed");
  assert(
    plan.asset && committed.assets[plan.asset.id]?.kind === "audio",
    "Committed Manifest is missing the Audio Asset",
  );
  assert(
    assetManifestCodec.parse(assetManifestCodec.serialize(committed)).ok,
    "Committed Audio Asset does not pass Manifest validation",
  );

  const invalidPlan = await createAssetImportPlan({
    fileName: "broken.mp3",
    mimeType: "audio/mpeg",
    bytes: new Uint8Array([0x00, 0x01, 0x02, 0x03]),
  });
  assert(
    !invalidPlan.canCommit &&
      invalidPlan.diagnostics.some(
        (diagnostic) => diagnostic.code === "mp3-signature-invalid",
      ),
    "Invalid MP3 signature was accepted",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Audio import fixture failed: ${message}`);
}
