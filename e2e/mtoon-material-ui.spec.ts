import { expect, test } from "@playwright/test";
import type { MaterialAsset, MaterialProperties } from "../src/lib/visual-editor/asset-manifest";

// In restricted environments, use an unchanged cache of the official font
// metadata. This isolates the library font request from material authoring.
test.beforeEach(async ({ page }) => {
  const metricsPath = process.env.XRIFT_E2E_FONT_METRICS_PATH;
  if (metricsPath) {
    await page.route("https://public.xrift.net/fonts/msdf/NotoSansJP/metrics.json?v=3", route =>
      route.fulfill({ contentType: "application/json", path: metricsPath }));
  }
});

for (const version of ["0.x", "1.0"] as const) {
test(`MToon ${version}の色と輪郭線を編集し、バージョン切替・Undo・PBR復帰・再読み込みで保持する`, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドをビジュアルで作る/ }).click();
  await page.getByRole("radio", { name: /空のワールド/ }).click();
  const projectName = `mtoon-material-ui-${version.replace(".", "-")}`;
  const materialType = `mtoon-${version}`;
  const otherType = version === "0.x" ? "mtoon-1.0" : "mtoon-0.x";
  await page.getByLabel("プロジェクト名").fill(projectName);
  await page.getByRole("button", { name: "作成して開く" }).click();
  const assets = page.getByRole("region", { name: "Assets" });
  await expect(assets.locator('input[type="file"]')).toHaveAttribute("accept", /(^|,)\.vrm(,|$)/);
  await assets.getByRole("button", { name: "新規アセットまたはフォルダー" }).click();
  await page.getByRole("button", { name: "新規マテリアル", exact: true }).click();

  const shading = page.getByRole("combobox", { name: "マテリアルの種類", exact: true });
  const roughness = page.getByRole("spinbutton", { name: "Roughnessの数値", exact: true });
  await roughness.fill("0.42");
  await roughness.press("Tab");
  await expect(shading.getByRole("option", { name: "MToon 0.x（エムトゥーン）", exact: true })).toHaveCount(1);
  await expect(shading.getByRole("option", { name: "MToon 1.0（エムトゥーン）", exact: true })).toHaveCount(1);
  await shading.selectOption(materialType);
  await expect(page.getByText(`MToon ${version} マテリアル`, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "MToon エムトゥーン", exact: true })).toBeVisible();
  await expect(roughness).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Clearcoatを有効にする" })).toHaveCount(0);
  const width = page.getByRole("spinbutton", { name: "Outline Width", exact: true });
  const mode = page.getByRole("combobox", { name: "Outline Width Mode", exact: true });
  const color = page.getByLabel("Outline Colorのカラーピッカー", { exact: true });
  await expect(mode).toHaveValue("worldCoordinates");
  await expect(width).toHaveValue("0.003");
  await color.fill("#c03050");
  await expect(color).toHaveValue("#c03050");
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(color).toHaveValue("#000000");
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await expect(color).toHaveValue("#c03050");
  await width.fill("0.007");
  await width.press("Tab");
  await mode.selectOption("none");
  await expect(width).toBeDisabled();
  await expect(color).toBeDisabled();
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(mode).toHaveValue("worldCoordinates");
  await expect(width).toHaveValue("0.007");

  const shade = page.getByLabel("Shade Colorのカラーピッカー", { exact: true });
  await shade.fill("#405060");
  const shift = page.getByRole("spinbutton", { name: "Shading Shift", exact: true });
  await shift.fill("-0.25");
  await shift.press("Tab");
  await shading.selectOption(otherType);
  await expect(shading).toHaveValue(otherType);
  await expect(shade).toHaveValue("#405060");
  await expect(shift).toHaveValue("-0.25");
  await expect(color).toHaveValue("#c03050");
  await expect(width).toHaveValue("0.007");
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(shading).toHaveValue(materialType);
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await expect(shading).toHaveValue(otherType);
  await shading.selectOption(materialType);

  const zWrite = page.getByRole("checkbox", { name: /^Transparent With ZWrite/ });
  await expect(zWrite).toBeDisabled();
  await page.getByRole("combobox", { name: "Alpha Mode", exact: true }).selectOption("BLEND");
  await expect(zWrite).toBeEnabled();
  await zWrite.click();
  await expect(zWrite).toBeChecked();
  await page.getByRole("combobox", { name: /^Depth Write/ }).selectOption("off");
  await expect(zWrite).toBeDisabled();
  await page.getByRole("combobox", { name: /^Depth Write/ }).selectOption("auto");
  const advanced = [
    ["Matcap Color R", "0.2"],
    ["Rim Color B", "0.4"],
    ["UV Scroll X Speed", "0.12"],
    ["Render Queue Offset", "-3"],
  ] as const;
  for (const [label, value] of advanced) {
    const input = page.getByRole("spinbutton", { name: label, exact: true });
    await input.fill(value);
    await input.press("Tab");
    await expect(input).toHaveValue(value);
  }

  await shading.selectOption("standard");
  await expect(roughness).toHaveValue("0.42");
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(shading).toHaveValue(materialType);
  await expect(color).toHaveValue("#c03050");
  await expect(width).toHaveValue("0.007");
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await expect(shading).toHaveValue("standard");
  await shading.selectOption(materialType);
  await expect(shade).toHaveValue("#405060");
  await expect(shift).toHaveValue("-0.25");
  await expect(color).toHaveValue("#c03050");
  await expect(width).toHaveValue("0.007");
  await expect(zWrite).toBeChecked();
  for (const [label, value] of advanced) await expect(page.getByRole("spinbutton", { name: label, exact: true })).toHaveValue(value);

  await expect(page.locator("header").first().getByRole("status")).toHaveText("保存済み");
  await page.getByRole("button", { name: /^プロジェクト一覧/ }).click();
  await page.getByTitle(`${projectName}を開く`, { exact: true }).click();
  await assets.getByRole("button", { name: /新規マテリアル/ }).first().click();
  await expect(shading).toHaveValue(materialType);
  await expect(page.getByText(`MToon ${version} マテリアル`, { exact: true })).toBeVisible();
  await expect(shade).toHaveValue("#405060");
  await expect(shift).toHaveValue("-0.25");
  await expect(color).toHaveValue("#c03050");
  await expect(width).toHaveValue("0.007");
  await expect(zWrite).toBeChecked();
  for (const [label, value] of advanced) await expect(page.getByRole("spinbutton", { name: label, exact: true })).toHaveValue(value);
  await expect(page.locator("header").first().getByRole("status")).toHaveText("保存済み");
  await shading.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath(`mtoon-${version}-thumbnail-inspector.png`) });
  await page.getByRole("heading", { name: /^Outline / }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath(`mtoon-${version}-inspector.png`) });
  expect(errors).toEqual([]);
});
}

test("単体の種類選択で個別の色・Texture・UVを保ち、PBR保存後もMToon専用設定を戻す", async ({ page }) => {
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("console",message=>{if(message.type()==="error") errors.push(message.text());});
  await page.setViewportSize({width:1600,height:1000});
  await page.goto("/e2e/material-batch.html");
  await page.evaluate(async()=>{
    const url="/e2e/material-batch.fixture.ts";
    (await import(/* @vite-ignore */ url)).mountMaterialBatchEditor(document.getElementById("root")!);
  });
  const readState=()=>page.evaluate(async()=>{
    const url="/e2e/material-batch.fixture.ts";
    const fixture=await import(/* @vite-ignore */ url) as typeof import("./material-batch.fixture");
    return fixture.readMaterialBatchState();
  });
  const common=(properties:MaterialProperties)=>{
    const {VRMC_materials_mtoon:_toon,...extensions}=properties.extensions;
    return {...properties,extensions};
  };
  const savedStatus=page.locator("header").first().getByRole("status");
  await expect(savedStatus).toHaveText("保存済み");
  const original=await readState();
  const blue=original.assets["batch-blue"] as MaterialAsset;
  const red=original.assets["batch-red"] as MaterialAsset;
  const assets=page.getByRole("region",{name:"Assets"});
  await page.getByPlaceholder("アセットを検索…").fill("Batch");
  await assets.getByRole("button",{name:/Batch Blue/}).click();
  const shading=page.getByRole("combobox",{name:"マテリアルの種類",exact:true});
  await expect(shading).toHaveValue("mtoon-1.0");
  const setShading = async (type: "standard" | "mtoon-0.x" | "mtoon-1.0") => {
    const saveCount = (await readState()).saveCount;
    await shading.selectOption(type);
    await expect.poll(async () => (await readState()).saveCount).toBeGreaterThan(saveCount);
    await expect(savedStatus).toHaveText("保存済み");
  };
  await setShading("standard");
  const standard=(await readState()).savedAssets["batch-blue"] as MaterialAsset;
  expect(common(standard.properties)).toEqual(common(blue.properties));
  expect(standard.savedMToonSettings).toEqual(blue.properties.extensions.VRMC_materials_mtoon);
  await page.evaluate(async()=>{
    const url="/e2e/material-batch.fixture.ts";
    (await import(/* @vite-ignore */ url)).reopenMaterialBatchEditor();
  });
  await expect(savedStatus).toHaveText("保存済み");
  await page.getByPlaceholder("アセットを検索…").fill("Batch");
  await assets.getByRole("button",{name:/Batch Blue/}).click();
  await expect(shading).toHaveValue("standard");
  for(const type of ["mtoon-0.x","mtoon-1.0"] as const){
    await setShading(type);
    const restored=(await readState()).assets["batch-blue"] as MaterialAsset;
    expect(common(restored.properties)).toEqual(common(blue.properties));
    expect(restored.properties.extensions.VRMC_materials_mtoon).toEqual({
      ...blue.properties.extensions.VRMC_materials_mtoon,
      extras:{...blue.properties.extensions.VRMC_materials_mtoon?.extras,xriftVrm0CompatShade:type==="mtoon-0.x"},
    });
    await expect(page.getByRole("combobox",{name:"Shade Multiply Mapのテクスチャ",exact:true})).toHaveValue("batch-texture-1");
    await expect(page.getByRole("combobox",{name:"Outline Width Multiply Mapのテクスチャ",exact:true})).toHaveValue("batch-texture-5");
    await expect(page.getByRole("combobox",{name:"Base Color Mapのテクスチャ",exact:true})).toHaveValue("batch-texture-2");
    await expect(page.getByRole("combobox",{name:"Normal Mapのテクスチャ",exact:true})).toHaveValue("batch-texture-4");
    await setShading("standard");
  }
  await assets.getByRole("button",{name:/Batch Red/}).click();
  await expect(shading).toHaveValue("standard");
  await setShading("mtoon-0.x");
  const created=(await readState()).assets["batch-red"] as MaterialAsset;
  expect(common(created.properties)).toEqual(common(red.properties));
  expect(created.properties.extensions.VRMC_materials_mtoon?.shadeColorFactor).toEqual(red.properties.pbrMetallicRoughness.baseColorFactor.slice(0,3).map(value=>value*.8));
  expect(created.properties.extensions.VRMC_materials_mtoon?.shadeMultiplyTexture).toEqual(red.properties.pbrMetallicRoughness.baseColorTexture);
  expect(errors).toEqual([]);
});
