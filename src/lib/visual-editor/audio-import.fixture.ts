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
import { applyExternalStoreInstall } from "./external-store";

/** An Ogg page header followed by the Vorbis identification packet. */
function oggVorbisBytes(): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  bytes.set([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73], 28); // 0x01 "vorbis"
  return bytes;
}

/** Filesystem-free assertions for MP3/WAV/OGG import, Manifest commit, and validation. */
export async function runAudioImportFixtureAssertions(): Promise<void> {
  const classification = classifyAssetImport("ambient.mp3", "audio/mpeg");
  assert(
    classification?.kind === "audio" && classification.format === "mp3",
    "MP3 was not classified as Audio",
  );
  const wavClassification = classifyAssetImport("ocean.wav", "audio/wav");
  assert(
    wavClassification?.kind === "audio" &&
      wavClassification.format === "wav",
    "WAV was not classified as Audio",
  );
  // Every container a browser can decode should import without conversion.
  const flacBytes = new Uint8Array(32);
  flacBytes.set([0x66, 0x4c, 0x61, 0x43], 0); // "fLaC"
  const m4aBytes = new Uint8Array(32);
  m4aBytes.set([0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20], 4); // "ftyp" "M4A "
  const webmBytes = new Uint8Array(32);
  webmBytes.set([0x1a, 0x45, 0xdf, 0xa3], 0);

  const webAudio: {
    fileName: string;
    mimeType: string;
    format: "ogg" | "flac" | "m4a" | "webm";
    storedMime: string;
    bytes: Uint8Array;
  }[] = [
    { fileName: "forest.ogg", mimeType: "audio/ogg", format: "ogg", storedMime: "audio/ogg", bytes: oggVorbisBytes() },
    { fileName: "hall.flac", mimeType: "audio/flac", format: "flac", storedMime: "audio/flac", bytes: flacBytes },
    { fileName: "voice.m4a", mimeType: "audio/mp4", format: "m4a", storedMime: "audio/mp4", bytes: m4aBytes },
    { fileName: "clip.weba", mimeType: "audio/webm", format: "webm", storedMime: "audio/webm", bytes: webmBytes },
  ];

  for (const entry of webAudio) {
    const classified = classifyAssetImport(entry.fileName, entry.mimeType);
    assert(
      classified?.kind === "audio" && classified.format === entry.format,
      `${entry.format} was not classified as Audio`,
    );
    const plan = await createAssetImportPlan({
      fileName: entry.fileName,
      mimeType: entry.mimeType,
      bytes: entry.bytes,
    });
    assert(plan.canCommit, `Valid ${entry.format} import plan was blocked`);
    assert(
      plan.asset?.kind === "audio" &&
        plan.asset.importMetadata.sourceFormat === entry.format &&
        plan.asset.importMetadata.mimeType === entry.storedMime,
      `${entry.format} did not create an Audio Asset with matching import metadata`,
    );
    const forged = await createAssetImportPlan({
      fileName: entry.fileName,
      mimeType: entry.mimeType,
      bytes: new Uint8Array(64),
    });
    assert(
      !forged.canCommit,
      `${entry.format} import accepted a file without a matching signature`,
    );
  }

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

  // A sound installed from the external store must land as a playable Audio
  // Asset that still passes Manifest validation.
  const installed = applyExternalStoreInstall(emptyManifest, {
    providerId: "otogura",
    providerName: "音蔵",
    externalId: "ambience-ocean-calm-01",
    name: "ambience-ocean-calm-01",
    assetKind: "audio",
    resolution: "src",
    files: [
      {
        role: "audio",
        relativePath:
          "assets/imported/external/otogura/ambience-ocean-calm-01/ambience-ocean-calm-01.ogg",
        byteLength: 788566,
        sha256: "fixture-external-ogg-sha256",
        format: "ogg",
      },
    ],
    authors: ["音蔵 (おとぐら)"],
    assetUrl: "https://yushimatenjin.github.io/sound-generator/",
    licenseName: "Free to use",
    licenseUrl: "https://stability.ai/license",
  });
  const installedAudio = installed.manifest.assets[installed.primaryAssetId];
  assert(
    installed.kind === "audio" && installedAudio?.kind === "audio",
    "External store install did not produce an Audio Asset",
  );
  assert(
    installedAudio?.kind === "audio" &&
      installedAudio.importMetadata.sourceFormat === "ogg" &&
      installedAudio.importMetadata.mimeType === "audio/ogg",
    "Installed sound did not record ogg import metadata",
  );
  assert(
    assetManifestCodec.parse(assetManifestCodec.serialize(installed.manifest)).ok,
    "Installed Audio Asset does not pass Manifest validation",
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

  const wavBytes = new Uint8Array(44);
  wavBytes.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(wavBytes.buffer).setUint32(4, 36, true);
  wavBytes.set(new TextEncoder().encode("WAVEfmt "), 8);
  const wavPlan = await createAssetImportPlan({
    fileName: "ocean.wav",
    mimeType: "audio/wav",
    bytes: wavBytes,
  });
  assert(
    wavPlan.canCommit &&
      wavPlan.asset?.kind === "audio" &&
      wavPlan.asset.importMetadata.sourceFormat === "wav" &&
      wavPlan.writes[0]?.mediaType === "audio/wav",
    "Valid WAV did not create a WAV Audio Asset",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Audio import fixture failed: ${message}`);
}
