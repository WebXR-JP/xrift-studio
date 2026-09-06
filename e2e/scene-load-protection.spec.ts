import { expect, test } from "@playwright/test";

test("大規模モデルの複製と自動品質の回帰検証", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  await page.evaluate(async () => {
    for (const [path, entry] of [
      ["/src/components/visual-editor/scene-viewport-quality.fixture.ts", "runSceneViewportQualityFixtureAssertions"],
      ["/src/components/visual-editor/texture-import-defaults.fixture.ts", "runTextureImportDefaultsFixtureAssertions"],
      ["/src/components/visual-editor/ProjectModelVisual.fixture.ts", "runProjectModelMaterialPreviewFixtureAssertions"],
    ]) await (await import(/* @vite-ignore */ path))[entry]();
  });
  expect(await page.evaluate(() => typeof console.timeStamp)).toBe("undefined");
});

test("KTX2圧縮中も画面が応答し、失敗後も次の画像を処理できる", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  const result = await page.evaluate(async () => {
    const path = "/src/lib/visual-editor/texture-codec.ts";
    const { encodeKtx2 } = await import(/* @vite-ignore */ path);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#88aa44";
    context.fillRect(0, 0, 256, 256);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!)));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const options = { quality: 80, generateMipmaps: true, srgb: true };
    let ticks = 0;
    const interval = setInterval(() => ticks++, 10);
    try {
      const failed = encodeKtx2(new Uint8Array([1, 2, 3]), options).then(() => false, () => true);
      const encoded = encodeKtx2(bytes, options);
      const [rejected, output] = await Promise.all([failed, encoded]);
      const threePath = "/node_modules/three/build/three.module.js";
      const loaderPath = "/node_modules/three/examples/jsm/loaders/KTX2Loader.js";
      const { WebGLRenderer } = await import(/* @vite-ignore */ threePath);
      const { KTX2Loader } = await import(/* @vite-ignore */ loaderPath);
      const renderer = new WebGLRenderer();
      const loader = new KTX2Loader().setTranscoderPath("/visual-editor/vendor/three-basis/").detectSupport(renderer);
      try {
        const texture = await new Promise<import("three").CompressedTexture>((resolve, reject) => loader.parse(output.buffer.slice(0), resolve, reject));
        renderer.initTexture(texture);
        const gpuError = renderer.getContext().getError();
        const dimensions = [texture.image.width, texture.image.height];
        texture.dispose();
        return { rejected, ticks, signature: Array.from(output.slice(0, 12)), sourceStillOwned: bytes.byteLength > 0, gpuError, dimensions };
      } finally {
        loader.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
      }
    } finally {
      clearInterval(interval);
    }
  });
  expect(result.rejected).toBe(true);
  expect(result.ticks).toBeGreaterThan(2);
  expect(result.sourceStillOwned).toBe(true);
  expect(result.gpuError).toBe(0);
  expect(result.dimensions).toEqual([256, 256]);
  expect(result.signature).toEqual([171, 75, 84, 88, 32, 50, 48, 187, 13, 10, 26, 10]);
});
