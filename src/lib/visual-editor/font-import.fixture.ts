import {
  classifyAssetImport,
  createAssetImportPlan,
} from "./asset-import";

/**
 * Minimal SFNT file carrying one `name` table with a family name.
 *
 * Built rather than fixtured from a real font so the assertions stay
 * filesystem-free and no licensed binary enters the repository.
 */
function trueTypeBytes(familyName: string): Uint8Array {
  const nameBytes = [...familyName].flatMap((character) => [
    character.charCodeAt(0) >> 8,
    character.charCodeAt(0) & 0xff,
  ]);
  // 12-byte header + one 16-byte table record, then the name table itself.
  const nameTableOffset = 12 + 16;
  const nameRecordCount = 1;
  const stringOffset = 6 + nameRecordCount * 12;
  const nameTable = [
    0x00, 0x00, // format 0
    0x00, nameRecordCount,
    stringOffset >> 8, stringOffset & 0xff,
    0x00, 0x03, // platform 3 (Windows)
    0x00, 0x01, // encoding 1 (Unicode BMP)
    0x04, 0x09, // language
    0x00, 0x01, // nameID 1 (family)
    nameBytes.length >> 8, nameBytes.length & 0xff,
    0x00, 0x00, // offset into the string storage
    ...nameBytes,
  ];
  const bytes = new Uint8Array(nameTableOffset + nameTable.length);
  bytes.set([0x00, 0x01, 0x00, 0x00], 0); // sfnt version 1.0
  bytes.set([0x00, 0x01], 4); // one table
  bytes.set([0x6e, 0x61, 0x6d, 0x65], 12); // "name"
  bytes.set(
    [
      0x00,
      0x00,
      0x00,
      0x00, // checksum
      (nameTableOffset >> 24) & 0xff,
      (nameTableOffset >> 16) & 0xff,
      (nameTableOffset >> 8) & 0xff,
      nameTableOffset & 0xff,
      0x00,
      0x00,
      0x00,
      nameTable.length & 0xff,
    ],
    16,
  );
  bytes.set(nameTable, nameTableOffset);
  return bytes;
}

/** Import assertions for the font containers Text can actually render. */
export async function runFontImportFixtureAssertions(): Promise<void> {
  const classification = classifyAssetImport("Inter-Regular.ttf", "font/ttf");
  assert(
    classification?.kind === "font" && classification.format === "ttf",
    "TTF was not classified as a Font",
  );
  const byExtensionOnly = classifyAssetImport("Inter-Regular.otf", "");
  assert(
    byExtensionOnly?.kind === "font" && byExtensionOnly.format === "otf",
    "A drag-and-drop OTF with no MIME type was not classified as a Font",
  );

  const plan = await createAssetImportPlan({
    fileName: "Inter-Regular.ttf",
    mimeType: "font/ttf",
    bytes: trueTypeBytes("Inter Fixture"),
  });
  assert(plan.canCommit, "Valid TTF import plan was blocked");
  assert(
    plan.asset?.kind === "font" &&
      plan.asset.importMetadata.sourceFormat === "ttf" &&
      plan.asset.importMetadata.mimeType === "font/ttf",
    "TTF did not create a Font Asset with matching import metadata",
  );
  assert(
    plan.asset?.kind === "font" &&
      plan.asset.importMetadata.familyName === "Inter Fixture" &&
      plan.asset.name === "Inter Fixture",
    "The family name in the font was not used to name the Asset",
  );
  assert(
    plan.asset?.source.kind === "project" &&
      plan.asset.source.relativePath.startsWith("assets/imported/fonts/") &&
      plan.asset.source.relativePath.endsWith("/Inter-Regular.ttf"),
    "Font source was not assigned a managed project-relative path",
  );
  assert(
    plan.writes.length === 1 &&
      plan.writes[0].purpose === "source" &&
      plan.writes[0].mediaType === "font/ttf",
    "Font import did not retain the source write",
  );

  // An OTF and a TTF are both SFNT wrappers and are published under either
  // name, so the container tag decides rather than the file name.
  const openType = new Uint8Array(32);
  openType.set([0x4f, 0x54, 0x54, 0x4f], 0); // "OTTO"
  const otfPlan = await createAssetImportPlan({
    fileName: "Display.otf",
    mimeType: "font/otf",
    bytes: openType,
  });
  assert(otfPlan.canCommit, "Valid OTF import plan was blocked");

  const woff = new Uint8Array(32);
  woff.set([0x77, 0x4f, 0x46, 0x46], 0); // "wOFF"
  const woffPlan = await createAssetImportPlan({
    fileName: "Body.woff",
    mimeType: "font/woff",
    bytes: woff,
  });
  assert(woffPlan.canCommit, "Valid WOFF import plan was blocked");

  // troika cannot parse WOFF2 and treats an unparsable font as a typesetting
  // pass that never completes, so the Text would go blank rather than fall
  // back. The refusal has to happen at import, with a reason.
  const woff2 = new Uint8Array(32);
  woff2.set([0x77, 0x4f, 0x46, 0x32], 0); // "wOF2"
  const woff2Plan = await createAssetImportPlan({
    fileName: "Body.woff",
    mimeType: "font/woff",
    bytes: woff2,
  });
  assert(
    !woff2Plan.canCommit &&
      woff2Plan.diagnostics.some(
        (diagnostic) => diagnostic.code === "woff2-not-supported",
      ),
    "WOFF2 was accepted, or refused without saying why",
  );

  const forged = await createAssetImportPlan({
    fileName: "Fake.ttf",
    mimeType: "font/ttf",
    bytes: new Uint8Array(32),
  });
  assert(
    !forged.canCommit,
    "Font import accepted a file without a matching signature",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
