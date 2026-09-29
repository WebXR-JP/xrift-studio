import { expect, test } from "@playwright/test";

test("all catalog recipe GLBs load and render in Three.js", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const fixtureUrl = "/src/lib/visual-editor/scene-recipe-catalog.fixture.ts";
    (await import(/* @vite-ignore */ fixtureUrl)).runSceneRecipeCatalogFixtureAssertions();
    const url = "/e2e/recipe-models.fixture.tsx";
    return (await import(/* @vite-ignore */ url)).renderModels();
  });
  expect(result.expected).toBeGreaterThan(0);
  expect(result.rendered).toBe(result.expected);
  expect(result.loaded).toBeGreaterThan(0);
  expect(result.disposed).toBe(result.loaded);
});

test("MToon 0.xと1.0の比較カードを実際の陰影と輪郭線で描画する", async ({ page }) => {
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("console",message=>{if(message.type()==="error") errors.push(message.text());});
  await page.setViewportSize({width:1050,height:650});
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async()=>{
    const url="/e2e/recipe-models.fixture.tsx";
    (await import(/* @vite-ignore */ url)).mount(["material-mtoon-0-outline","material-mtoon-outline"]);
  });
  await expect(page.locator("section img")).toHaveCount(2,{timeout:20000});
  const result=await page.evaluate(async()=>{
    const url="/e2e/recipe-models.fixture.tsx";
    const fixture=await import(/* @vite-ignore */ url) as typeof import("./recipe-models.fixture");
    const differences=await Promise.all([...document.querySelectorAll<HTMLImageElement>("section img")].map(async image=>{
      await image.decode();
      const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const context=canvas.getContext("2d")!;context.drawImage(image,0,0);
      const {data}=context.getImageData(0,0,canvas.width,canvas.height);
      let difference=0,samples=0;
      for(let y=Math.floor(canvas.height*.2);y<Math.floor(canvas.height*.7);y++){
        for(let x=Math.floor(canvas.width*.12);x<Math.floor(canvas.width*.38);x++){
          const left=(y*canvas.width+x)*4;
          const right=(y*canvas.width+x+Math.floor(canvas.width/2))*4;
          for(let channel=0;channel<3;channel++) difference+=Math.abs(data[left+channel]!-data[right+channel]!);
          samples+=3;
        }
      }
      return difference/samples;
    }));
    return {materials:fixture.mtoonPreviewMaterials(),lights:fixture.mtoonPreviewLights(),differences,resources:fixture.resourceCounts()};
  });
  for(const legacy of [true,false]){
    expect(result.materials.some(material=>material.legacy===legacy&&!material.outline)).toBe(true);
    expect(result.materials.some(material=>material.legacy===legacy&&material.outline&&material.width===.006&&material.sharesGeometry)).toBe(true);
  }
  for (const legacy of [true, false]) {
    const lights = result.lights.find(([version]) => version === legacy)?.[1];
    expect(lights?.some(light => light.type === "DirectionalLight" && light.intensity > 0 && Math.abs(light.position[0]!) > 1)).toBe(true);
    expect(lights?.filter(light => light.type === "AmbientLight").reduce((sum, light) => sum + light.intensity, 0)).toBeLessThan(.2);
  }
  result.differences.forEach(difference=>expect(difference).toBeGreaterThan(5));
  expect(result.resources.loaded).toBeGreaterThan(0);
  expect(result.resources.disposed).toBe(result.resources.loaded);
  await page.screenshot({path:test.info().outputPath("mtoon-comparison-cards.png")});
  expect(errors).toEqual([]);
});

test("recipe cards wait for GLBs before capture and release the loaded geometry", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/e2e.html?scenario=ready");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/recipe-assets/campfire-base.glb*", async route => { await gate; await route.continue(); });
  const request = page.waitForRequest("**/recipe-assets/campfire-base.glb*");
  await page.evaluate(async () => {
    const url = "/e2e/recipe-models.fixture.tsx";
    (await import(/* @vite-ignore */ url)).mount(["campfire", "fountain", "well"]);
  });
  await request;
  await page.waitForTimeout(1300);
  await expect(page.getByRole("region", { name: "焚き火", exact: true }).locator("img")).toHaveCount(0);
  release();
  await expect(page.locator("section img")).toHaveCount(3, { timeout: 20000 });
  const counts = await page.evaluate(async () => {
    const url = "/e2e/recipe-models.fixture.tsx";
    return (await import(/* @vite-ignore */ url)).resourceCounts();
  });
  expect(counts.loaded).toBeGreaterThan(0);
  expect(counts.disposed).toBe(counts.loaded);
  await page.screenshot({ path: "test-results/recipe-models.png" });
  expect(errors).toEqual([]);
});

test("closing a preview before its GLB arrives disposes the late load", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/recipe-assets/fountain.glb*", async route => { await gate; await route.continue(); });
  const request = page.waitForRequest("**/recipe-assets/fountain.glb*");
  await page.evaluate(async () => {
    const url = "/e2e/recipe-models.fixture.tsx";
    (await import(/* @vite-ignore */ url)).mount(["fountain"], true);
  });
  await request;
  await page.evaluate(async () => {
    const url = "/e2e/recipe-models.fixture.tsx";
    (await import(/* @vite-ignore */ url)).unmount();
  });
  release();
  await expect.poll(() => page.evaluate(async () => {
    const url = "/e2e/recipe-models.fixture.tsx";
    const counts = (await import(/* @vite-ignore */ url)).resourceCounts();
    return counts.loaded > 0 && counts.loaded === counts.disposed;
  })).toBe(true);
});

test("failed model previews show a failure instead of caching an incomplete image", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.route("**/recipe-assets/fountain.glb*", route => route.abort());
  await page.evaluate(async () => {
    const url = "/e2e/recipe-models.fixture.tsx";
    (await import(/* @vite-ignore */ url)).mount(["fountain"]);
  });
  await expect(page.getByText("モデルを読み込めませんでした", { exact: true })).toBeVisible();
  await expect(page.locator("section img")).toHaveCount(0);
});
