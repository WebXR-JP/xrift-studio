import { expect, test } from "@playwright/test";

test("頂点カラー、OpacityのRGBA、Mask、片面・両面を実描画する", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/e2e.html?scenario=ready");
  const pixels = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { THREE: T, materialSurfaceProps, normalizeMaterialProperties } = await load("/e2e/material-surface.fixture.ts");
    const renderer = new T.WebGLRenderer();
    renderer.setSize(16, 16);
    renderer.outputColorSpace = T.LinearSRGBColorSpace;
    const target = new T.WebGLRenderTarget(16, 16);
    renderer.setRenderTarget(target);
    const scene = new T.Scene();
    scene.background = new T.Color(0, 0, 0);
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 2;
    const geometry = new T.PlaneGeometry(2, 2);
    const material = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    const mesh = new T.Mesh(geometry, material);
    scene.add(mesh);
    const texture = new T.DataTexture(new Uint8Array([32, 96, 160, 224]), 1, 1);
    texture.needsUpdate = true;
    function sample() {
      material.needsUpdate = true;
      renderer.render(scene, camera);
      const pixel = new Uint8Array(4);
      renderer.readRenderTargetPixels(target, 8, 8, 1, 1, pixel);
      return [...pixel].slice(0, 3);
    }
    const channels: number[][] = [], masks: number[][] = [];
    for (const opacityChannel of ["r", "g", "b", "a"]) {
      Object.assign(material, materialSurfaceProps(normalizeMaterialProperties({ opacityTexture: "opacity", opacityChannel }), texture));
      material.alphaTest = 0;
      channels.push(sample());
      material.alphaTest = 0.5;
      masks.push(sample());
    }
    material.alphaTest = 0;
    Object.assign(material, materialSurfaceProps(normalizeMaterialProperties({ vertexColors: true })));
    const withoutColors = sample();
    geometry.setAttribute("color", new T.Float32BufferAttribute(Array.from({ length: 4 }, () => [0.2, 0.6, 0.9]).flat(), 3));
    const vertex = sample();
    Object.assign(material, materialSurfaceProps(normalizeMaterialProperties({ vertexColors: false })));
    const disabled = sample();
    camera.position.z = -2;
    camera.lookAt(0, 0, 0);
    const frontOnly = sample();
    material.side = T.DoubleSide;
    const doubleSided = sample();
    texture.dispose(); geometry.dispose(); material.dispose(); target.dispose(); renderer.dispose();
    return { channels, masks, vertex, withoutColors, disabled, frontOnly, doubleSided };
  });
  pixels.channels.forEach((pixel, index) => pixel.forEach(value => expect(Math.abs(value - [32, 96, 160, 224][index])).toBeLessThanOrEqual(1)));
  expect(pixels.masks.slice(0, 2)).toEqual([[0, 0, 0], [0, 0, 0]]);
  expect(pixels.masks.slice(2)).toEqual(pixels.channels.slice(2));
  pixels.vertex.forEach((value, index) => expect(Math.abs(value - [51, 153, 230][index])).toBeLessThanOrEqual(1));
  expect(pixels.withoutColors).toEqual([255, 255, 255]);
  expect(pixels.disabled).toEqual([255, 255, 255]);
  expect(pixels.frontOnly).toEqual([0, 0, 0]);
  expect(pixels.doubleSided).toEqual([255, 255, 255]);
  expect(errors).toEqual([]);
});

test("Opacityの参照を保存・公開コードへ渡し、解除できる", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const m = await load("/e2e/material-surface.fixture.ts");
    const project = m.createPrototypeProject("world");
    const texture = m.createTextureAsset({ id: "opacity-test", name: "Opacity", source: { kind: "project", relativePath: "assets/opacity.png" } });
    project.assets.assets[texture.id] = texture;
    const id = m.BUILTIN_ASSET_IDS.material.blue;
    project.assets = m.updateMaterialAsset(project.assets, id, { vertexColors: true, opacityTexture: { textureAssetId: texture.id, texCoord: 1, transform: { scale: [2, 3], offset: [0.1, 0.2] } }, opacityChannel: "b", alphaMode: "MASK", doubleSided: true });
    const saved = m.assetManifestCodec.serialize(project.assets);
    const parsed = m.assetManifestCodec.parse(saved);
    const output = m.compileVisualProject({ project: project.project, assets: project.assets, scenes: { [project.scene.sceneId]: project.scene }, prefabs: project.prefabs });
    const source = output.overlayFiles.find((file: { relativePath: string }) => file.relativePath === "src/World.tsx")?.content ?? "";
    const cleared = m.updateMaterialAsset(project.assets, id, { opacityTexture: null, vertexColors: false });
    return { valid: parsed.ok, saved: JSON.parse(saved).assets[id].properties, source, cleared: cleared.assets[id].properties, legacy: m.normalizeMaterialProperties({}) };
  });
  expect(result.valid).toBe(true);
  expect(result.saved).toMatchObject({ vertexColors: true, opacityChannel: "b", opacityTexture: { textureAssetId: "opacity-test", texCoord: 1 } });
  expect(result.source).toContain("vertexColors={true}");
  expect(result.source).toContain("alphaMap={opacityMap}");
  expect(result.source).toContain("vAlphaMapUv ).b");
  expect(result.source).toContain("opacity.png");
  expect(result.cleared.opacityTexture).toBeUndefined();
  expect(result.cleared.vertexColors).toBe(false);
  expect(result.legacy).toMatchObject({ vertexColors: false, opacityChannel: "a" });
});

test("頂点カラーとOpacity Channelを編集しUndo・Redo・再読み込みできる", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドをビジュアルで作る/ }).click();
  await page.getByRole("radio", { name: /空のワールド/ }).click();
  await page.getByLabel("プロジェクト名").fill("material-surface-regression");
  await page.getByRole("button", { name: "作成して開く" }).click();
  const vertex = page.getByLabel("頂点カラーを使用");
  await vertex.click();
  await expect(vertex).toBeChecked();
  const channel = page.getByRole("combobox", { name: "Channel", exact: true });
  await channel.selectOption("r");
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(channel).toHaveValue("a");
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await expect(channel).toHaveValue("r");
  await page.getByRole("button", { name: "プロジェクト一覧", exact: true }).click();
  await page.locator('button[title="material-surface-regressionを開く"]').click();
  await expect(vertex).toBeChecked();
  await expect(channel).toHaveValue("r");
  await expect(page.locator("header").first().getByRole("status")).toHaveText("保存済み");
});
