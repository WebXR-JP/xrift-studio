import { expect, test } from "@playwright/test";

test("初期設定のPNG取り込みは原寸・透過・元バイト列を維持する", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const defaultsPath = "/src/components/visual-editor/texture-import-defaults.ts";
    const fixturesPath = "/src/components/visual-editor/texture-import-defaults.fixture.ts";
    const importPath = "/src/lib/visual-editor/asset-import.ts";
    const processingPath = "/src/lib/visual-editor/texture-processing.ts";
    const { DEFAULT_TEXTURE_IMPORT_MAX_SIZE, DEFAULT_TEXTURE_IMPORT_COMPRESSION, textureImportSettingsPatch } = await import(/* @vite-ignore */ defaultsPath);
    await (await import(/* @vite-ignore */ fixturesPath)).runTextureImportDefaultsFixtureAssertions();
    const { createAssetImportPlan, commitAssetImportPlan } = await import(/* @vite-ignore */ importPath);
    const { planTextureProcessing } = await import(/* @vite-ignore */ processingPath);
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "rgba(0, 200, 100, 0.5)";
    context.fillRect(1, 0, 2047, 1024);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), "image/png"));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const plan = await createAssetImportPlan({
      fileName: "panorama.png", mimeType: "image/png", bytes,
      textureImportSettings: textureImportSettingsPatch(DEFAULT_TEXTURE_IMPORT_MAX_SIZE, DEFAULT_TEXTURE_IMPORT_COMPRESSION),
    });
    const source = plan.writes.find((write: { purpose: string }) => write.purpose === "source");
    const original = source.payload.bytes as Uint8Array;
    const committed = await commitAssetImportPlan({ schemaVersion: 1, assets: {} }, plan, async () => undefined);
    const asset = committed.assets[plan.asset.id];
    const image = new Image();
    image.src = URL.createObjectURL(new Blob([original.slice()], { type: "image/png" }));
    await image.decode();
    const decoded = document.createElement("canvas");
    decoded.width = image.width;
    decoded.height = image.height;
    const decodedContext = decoded.getContext("2d")!;
    decodedContext.drawImage(image, 0, 0);
    URL.revokeObjectURL(image.src);
    return {
      canCommit: plan.canCommit,
      bytesEqual: original.length === bytes.length && original.every((value, index) => value === bytes[index]),
      dimensions: [asset.importMetadata.width, asset.importMetadata.height],
      alpha: [decodedContext.getImageData(0, 0, 1, 1).data[3], decodedContext.getImageData(1, 0, 1, 1).data[3]],
      sourceFormat: asset.importMetadata.sourceFormat,
      pending: planTextureProcessing(asset).pending,
      compression: asset.importSettings.compression.format,
      resize: asset.importSettings.resize.mode,
      optimized: Boolean(asset.optimizedFrom),
    };
  });
  expect(result).toEqual({
    canCommit: true, bytesEqual: true, dimensions: [2048, 1024], alpha: [0, 128],
    sourceFormat: "png", pending: false, compression: "source", resize: "original", optimized: false,
  });
});
