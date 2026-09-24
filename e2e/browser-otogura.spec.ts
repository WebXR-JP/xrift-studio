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
