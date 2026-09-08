import { test, expect } from "@playwright/test";
import manifest from "../docs/guide/manifest.json" with { type: "json" };

test("旧Wikiページと移行マップを配信しない", async ({ request }) => {
  for (const path of ["classic-editor.html", "assets-and-materials.html", "legacy-map.json"]) {
    expect((await request.get(`/wiki/${path}`)).status()).toBe(404);
  }
});

test("作業場所からガイドを開き、閉じて元の操作へ戻れる", async ({ page }, testInfo) => {
  await page.goto("/e2e.html?scenario=ready");
  const trigger = page.locator('[data-guide-trigger="first-world"]').first();
  await trigger.click();
  const panel = page.locator(".embedded-guide");
  await expect(panel.getByRole("heading", { level: 1 })).toHaveText("最初のワールドを作る");
  await expect(panel.locator("article")).toContainText("Sphere");
  await expect(panel).not.toHaveAttribute("aria-modal", "true");
  await page.screenshot({ path: testInfo.outputPath("embedded-guide.png") });
  await panel.getByRole("button", { name: "ガイドを閉じて編集に戻る" }).click();
  await expect(trigger).toBeFocused();
  await expect(panel).toHaveCount(0);
});

for (const width of [320, 390, 768, 1440]) {
  test(`使い方ガイドの全記事が横にはみ出さない ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 });
    for (const entry of manifest.pages) {
      await page.goto(`/wiki/${entry.slug}.html`);
      await expect(page.locator("main h1")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),entry.slug).toBe(true);
      expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize))).toBeGreaterThanOrEqual(16);
      if (entry.slug === "index" || entry.slug === "materials") {
        await page.screenshot({ path: testInfo.outputPath(`${entry.slug}-${width}.png`), fullPage: true });
      }
    }
  });
}

test("本文検索から該当見出しを開き、普通のアンカーではページを切り替えない", async ({page}) => {
  await page.goto("/wiki/materials.html");
  await page.getByRole("button", {name:"使い方を検索"}).click();
  await page.getByRole("searchbox").fill("Tangent Space");
  await page.locator(".guide-search-results a").first().click();
  await expect(page).toHaveURL(/textures\.html#/);
  await page.goto("/wiki/materials.html");
  if(await page.locator(".guide-inline-toc").isVisible()) await page.locator(".guide-inline-toc summary").click();
  await page.locator('a[href="#作って割り当てる"]:visible').first().click();
  await expect(page).toHaveURL(/materials\.html#/);
  await expect(page.locator("main h1")).toHaveText("色と質感を変える");
});

test("モバイル目次と検索の閉じ方がキーボードでも分かる", async ({page}) => {
  await page.setViewportSize({width:320,height:760});await page.goto("/wiki/");
  const search=page.getByRole("button",{name:"使い方を検索"});await search.click();
  await expect(page.getByRole("searchbox")).toBeFocused();
  await page.getByRole("searchbox").fill("ラフネス");
  await page.keyboard.press("Escape");await expect(search).toBeFocused();
  await page.locator("[data-mobile-nav]>summary").click();
  await page.keyboard.press("Escape");await expect(page.locator("[data-mobile-nav]")).not.toHaveAttribute("open","");
});


test("検索失敗時にも目次・再試行を残す",async({page})=>{
 await page.route("**/search-index.json",route=>route.abort());await page.goto("/wiki/");
 await page.getByRole("button",{name:"使い方を検索"}).click();await page.getByRole("searchbox").fill("保存");
 await expect(page.getByRole("button",{name:"読み込みをやり直す"})).toBeVisible();
 await expect(page.getByRole("dialog").getByRole("link",{name:"目次から探す"})).toBeVisible();
});

test("JavaScriptなしでも本文・次の手順・目次を読める",async({browser,baseURL})=>{
 const context=await browser.newContext({javaScriptEnabled:false,baseURL});const page=await context.newPage();
 await page.goto("/wiki/materials.html");await expect(page.getByText("Base Color（ベースカラー）は",{exact:false})).toBeVisible();
 await expect(page.locator(".guide-next")).toBeVisible();await context.close();
});


test("ガイドのダウンロードリンクに対応するLPの欄が表示される", async ({ page }) => {
  await page.goto("/wiki/index.html");
  await expect(page.getByRole("link", { name: "ダウンロード", exact: true })).toHaveAttribute("href", "../index.html#download");
  // Pages renames preview.html to index.html when publishing.
  await page.goto("/preview.html#download");
  await expect(page.locator("#download")).toBeVisible();
  await expect(page.locator("#download")).toBeInViewport();
});
