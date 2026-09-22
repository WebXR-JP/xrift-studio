import { expect, test, type Page } from "@playwright/test";
import type { JevWorldBuilderFixtureOptions } from "./jev-world-builder.fixture";

const PROMPT_LABEL = "作りたいワールド";

async function mountFixture(page: Page, options: JevWorldBuilderFixtureOptions = {}) {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("heading", { name: "プロジェクト", exact: true })).toBeVisible();
  await page.evaluate(async (fixtureOptions) => {
    const path = "/e2e/jev-world-builder.fixture.tsx";
    const { mountJevWorldBuilderFixture } = await import(/* @vite-ignore */ path);
    mountJevWorldBuilderFixture(fixtureOptions);
  }, options);
  const fixture = page.getByRole("region", { name: "Jev world builder UI test fixture" });
  await expect(fixture.getByLabel(PROMPT_LABEL, { exact: true })).toBeVisible();
  return fixture;
}

test.describe("Standalone Jev world builder UI (mocked native commands; no live API)", () => {
  test("voice focuses the editable field; reviewing text never auto-submits; explicit creation runs once and locks keys", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const fixture = await mountFixture(page);
    const prompt = fixture.getByLabel(PROMPT_LABEL, { exact: true });
    const voice = fixture.getByRole("button", { name: "音声で入力", exact: true });
    await expect(voice).toBeEnabled();
    await voice.click();
    await expect(fixture).toHaveAttribute("data-dictation-starts", "1");
    await expect(fixture).toHaveAttribute("data-focused-at-dictation-start", "true");
    await expect(prompt).toBeFocused();
    await expect(prompt).toBeEditable();
    await expect(fixture).toHaveAttribute("data-prompts", "[]");

    // The browser has no microphone/OS recognition: insert and revise text to
    // verify the review flow without pretending to test speech recognition.
    await prompt.fill("夜の森に焚き火を作って");
    await prompt.fill("夜の森に焚き火とベンチを4つ作って");
    await expect(fixture).toHaveAttribute("data-prompts", "[]");
    await fixture.getByTestId("world-builder-surface").screenshot({ path: test.info().outputPath("voice-review.png") });
    await fixture.getByText("Jev接続設定", { exact: true }).click();
    const apiKey = fixture.getByLabel("TypeSafe APIキー", { exact: true });
    await apiKey.fill("fixture-not-a-real-key");
    const create = fixture.getByRole("button", { name: "ワールドを作る", exact: true });
    await expect(create).toBeEnabled();
    // Same-turn clicks exercise the synchronous guard before React paints the
    // disabled button and before any parent planning state arrives.
    await create.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(fixture).toHaveAttribute("data-prompts", JSON.stringify(["夜の森に焚き火とベンチを4つ作って"]));
    await expect(prompt).toBeDisabled();
    await expect(apiKey).toBeDisabled();
    await expect(fixture.getByRole("button", { name: "保存して接続確認", exact: true })).toBeDisabled();
    await expect(fixture.getByRole("button", { name: "接続確認", exact: true })).toBeDisabled();
    await expect(fixture.getByRole("button", { name: "キーを削除", exact: true })).toBeDisabled();
    await expect(voice).toBeDisabled();
    await expect(fixture).toHaveAttribute("data-key-mutations", "0");

    await page.evaluate(async () => {
      const path = "/e2e/jev-world-builder.fixture.tsx";
      const { completeJevWorldBuilderFixture } = await import(/* @vite-ignore */ path);
      completeJevWorldBuilderFixture();
    });
    await expect(prompt).toBeEditable();
    await expect(apiKey).toBeEnabled();
    await expect(prompt).toHaveValue("夜の森に焚き火とベンチを4つ作って");
    await expect(fixture).toContainText("Playで歩いて確認できます。");
    await fixture.getByRole("button", { name: "元に戻す", exact: true }).click();
    await expect(fixture).toHaveAttribute("data-undo-count", "1");
    expect(pageErrors).toEqual([]);
  });

  test("native activation failure preserves Japanese text and permits a typed retry", async ({ page }) => {
    const fixture = await mountFixture(page, { dictationError: "テスト用のOS起動エラー" });
    const prompt = fixture.getByLabel(PROMPT_LABEL, { exact: true });
    await prompt.fill("夜の森に小さな休憩所を作って");
    const voice = fixture.getByRole("button", { name: "音声で入力", exact: true });
    await expect(voice).toBeEnabled();
    await voice.click();
    await expect(fixture.getByRole("alert")).toContainText("音声入力を開けませんでした。");
    await expect(prompt).toHaveValue("夜の森に小さな休憩所を作って");
    await expect(prompt).toBeEditable();
    await expect(fixture).toHaveAttribute("data-focused-at-dictation-start", "true");
    await expect(fixture).toHaveAttribute("data-prompts", "[]");
    await expect(fixture.getByRole("button", { name: "ワールドを作る", exact: true })).toBeEnabled();
  });

  test("manual OS guidance focuses the draft without requesting native activation", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const fixture = await mountFixture(page, { manualDictation: true });
    const prompt = fixture.getByLabel(PROMPT_LABEL, { exact: true });
    await prompt.fill("竹と石灯籠のある庭園を作って");
    await fixture.getByRole("button", { name: "音声入力の使い方", exact: true }).click();
    await expect(prompt).toBeFocused();
    await expect(prompt).toHaveValue("竹と石灯籠のある庭園を作って");
    await expect(fixture).toContainText("音声入力のショートカットを押してください。");
    await expect(fixture).toHaveAttribute("data-dictation-starts", "0");
    await expect(fixture).toHaveAttribute("data-prompts", "[]");
    const surface = fixture.getByTestId("world-builder-surface");
    expect(await surface.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await surface.screenshot({ path: test.info().outputPath("manual-input-360.png") });
  });

  test("missing API key prevents generation; one save verifies the connection and preserves the draft", async ({ page }) => {
    const fixture = await mountFixture(page, { configured: false });
    const prompt = fixture.getByLabel(PROMPT_LABEL, { exact: true });
    await prompt.fill("明るい草原に木と岩を置いて");
    await expect(prompt).toBeEditable();
    const create = fixture.getByRole("button", { name: "ワールドを作る", exact: true });
    await expect(create).toBeDisabled();
    const apiKey = fixture.getByLabel("TypeSafe APIキー", { exact: true });
    await expect(apiKey).toBeVisible();
    await expect(fixture).toHaveAttribute("data-prompts", "[]");
    await apiKey.fill("fixture-not-a-real-key");
    const save = fixture.getByRole("button", { name: "保存して接続確認", exact: true });
    await expect(save).toBeEnabled();
    await save.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(fixture).toHaveAttribute("data-key-mutations", "1");
    await expect(fixture).toHaveAttribute("data-connection-tests", "1");
    await expect(fixture).toContainText("APIキーを保存し、Jevへの接続を確認しました。");
    await expect(create).toBeEnabled();
    await expect(prompt).toHaveValue("明るい草原に木と岩を置いて");
    await expect(apiKey).toHaveValue("");
    await expect(fixture).toHaveAttribute("data-prompts", "[]");
  });
});
