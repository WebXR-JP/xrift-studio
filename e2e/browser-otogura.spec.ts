import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const apiRoot = "https://yushimatenjin.github.io/sound-generator/api/v1";
const audioUrl = "https://yushimatenjin.github.io/sound-generator/processed/medium/browser-import-test.ogg";
const audio = readFileSync(new URL("./fixtures/otogura-silence.ogg", import.meta.url));
const cors = { "access-control-allow-origin": "*" };

test("ブラウザ版で音蔵の音源を追加し、再読み込み後も使える", async ({ page }) => {
  await page.route(`${apiRoot}/assets.json`, (route) => route.fulfill({
    contentType: "application/json",
    headers: cors,
    body: JSON.stringify({
      "browser-import-test": {
        name: "ブラウザ取り込みテスト",
        description: "音蔵からの取り込みを確認する音源",
        categories: ["テスト"],
        tags: ["audio"],
        authors: { "音蔵 (おとぐら)": "generator" },
        license: "Free to use",
        license_url: "https://yushimatenjin.github.io/sound-generator/",
      },
    }),
  }));
  await page.route(`${apiRoot}/files/browser-import-test.json`, (route) => route.fulfill({
    contentType: "application/json",
    headers: cors,
    body: JSON.stringify({ audio: { src: { ogg: { url: audioUrl, size: audio.byteLength } } } }),
  }));
  await page.route(audioUrl, (route) => route.fulfill({
    contentType: "audio/ogg",
    headers: cors,
    body: audio,
  }));
  await page.route(`${apiRoot}/thumb/browser-import-test.png`, (route) => route.fulfill({
    contentType: "image/png",
    headers: cors,
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9pQ5sAAAAASUVORK5CYII=", "base64"),
  }));

  await page.goto("/editor.html");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドを作る/ }).click();
  await page.getByRole("textbox", { name: "プロジェクト名" }).fill("音蔵ブラウザE2E");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await page.getByRole("button", { name: "外部から追加", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "外部から追加" });
  await dialog.getByRole("button", { name: /音蔵.*効果音と環境音/ }).click();
  await expect(dialog.getByRole("heading", { name: "ブラウザ取り込みテスト" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "プロジェクトに追加" })).toBeEnabled();
  await dialog.getByRole("button", { name: "プロジェクトに追加" }).click();
  await expect(dialog.getByRole("status")).toContainText("ブラウザ取り込みテスト");
  await dialog.getByRole("button", { name: "「外部から追加」を閉じる" }).click();
  await expect(page.getByRole("button", { name: /Audio 1/ })).toBeVisible();
  await expect(page.getByRole("status", { name: "変更はまもなく自動保存されます" })).toBeVisible();
  await expect(page.getByRole("status", { name: "変更は自動保存されています" })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /ワールド ビジュアルエディター 音蔵ブラウザE2E/ }).click();
  await expect(page.getByRole("button", { name: /Audio 1/ })).toBeVisible();
  await page.getByRole("button", { name: /Audio 1/ }).click();
  await page.getByRole("button", { name: /音声 ブラウザ取り込みテスト/ }).click();
  await expect(page.getByRole("complementary", { name: "Inspector" }).locator("audio[controls]"))
    .toHaveAttribute("src", /^data:audio\/ogg;base64,/);
});

test("音蔵の589音源を最後まで表示し、検索と開き直しで表示件数を戻せる", async ({ page }) => {
  // Match the published catalog's size without depending on the live service.
  const catalog = Object.fromEntries(Array.from({ length: 589 }, (_, index) => {
    const id = `catalog-${String(index).padStart(3, "0")}`;
    return [id, {
      name: id,
      description: index < 375 ? "環境音" : "楽曲",
      categories: [index < 375 ? "環境音" : "楽曲・BGM"],
      tags: ["audio"],
      authors: { "テスト": "generator" },
      license: "Test fixture",
      license_url: "https://yushimatenjin.github.io/sound-generator/",
    }];
  }));
  await page.route(`${apiRoot}/assets.json`, (route) => route.fulfill({
    contentType: "application/json", headers: cors, body: JSON.stringify(catalog),
  }));
  await page.route(`${apiRoot}/files/*.json`, (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop()!.replace(".json", "");
    return route.fulfill({ contentType: "application/json", headers: cors,
      body: JSON.stringify({ audio: { src: { ogg: {
        url: `https://yushimatenjin.github.io/sound-generator/processed/medium/${id}.ogg`,
        size: audio.byteLength,
      } } } }),
    });
  });
  await page.route("https://yushimatenjin.github.io/sound-generator/processed/medium/*.ogg", (route) => route.fulfill({
    contentType: "audio/ogg", headers: cors, body: audio,
  }));
  await page.route(`${apiRoot}/thumb/*.png`, (route) => route.fulfill({
    contentType: "image/png", headers: cors,
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9pQ5sAAAAASUVORK5CYII=", "base64"),
  }));
  await page.goto("/editor.html");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドを作る/ }).click();
  await page.getByRole("textbox", { name: "プロジェクト名" }).fill("音蔵全件テスト");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await page.getByRole("button", { name: "外部から追加", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "外部から追加" });
  const provider = dialog.getByRole("button", { name: /音蔵.*効果音と環境音/ });
  await provider.click();
  const list = dialog.getByRole("region", { name: "音蔵のアセット一覧" });
  const cards = list.locator("[data-catalog-card]");
  const search = list.getByRole("textbox", { name: "音蔵を検索" });
  await expect(cards).toHaveCount(120);
  await expect(list).toContainText("589件中120件を表示");
  for (const count of [240, 360, 480, 589]) {
    await list.getByRole("button", { name: /さらに\d+件を表示/ }).click();
    await expect(cards).toHaveCount(count);
  }
  await expect(list.getByRole("button", { name: /さらに\d+件を表示/ })).toHaveCount(0);
  await cards.last().click();
  await expect(dialog.getByRole("heading", { name: "catalog-588" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "プロジェクトに追加" })).toBeEnabled();
  await dialog.getByRole("button", { name: "プロジェクトに追加" }).click();
  await expect(dialog.getByRole("status")).toContainText("catalog-588");

  await search.fill("楽曲");
  await expect(cards).toHaveCount(120);
  await expect(list).toContainText("214件中120件を表示");
  await list.getByRole("button", { name: "さらに94件を表示" }).click();
  await expect(cards).toHaveCount(214);
  await search.fill("存在しない音源");
  await expect(cards).toHaveCount(0);
  await expect(list).toContainText("条件に合うアセットがありません");
  await search.fill("catalog-588");
  await expect(cards).toHaveCount(1);
  await search.fill("");
  await expect(cards).toHaveCount(120);
  await list.getByRole("button", { name: "さらに120件を表示" }).click();
  await list.getByRole("combobox", { name: "アセット種別" }).selectOption("audio");
  await expect(cards).toHaveCount(120);
  await list.getByRole("button", { name: "さらに120件を表示" }).click();
  await dialog.getByRole("button", { name: /ギミック/ }).click();
  await provider.click();
  await expect(cards).toHaveCount(120);
  await list.getByRole("button", { name: "さらに120件を表示" }).click();
  await dialog.getByRole("button", { name: "「外部から追加」を閉じる" }).click();
  await page.getByRole("button", { name: "外部から追加", exact: true }).click();
  await expect(cards).toHaveCount(120);
});
