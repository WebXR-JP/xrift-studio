import { expect, test, type Page } from "@playwright/test";

type BrowserReleaseE2EState = {
  calls: Array<{ command: string; detail?: string }>;
  shellCommands: string[];
  uploadAttempts: string[];
  unhandledCommands: string[];
};

async function releaseE2EState(
  page: Page,
): Promise<BrowserReleaseE2EState | null> {
  return page.evaluate(() => {
    const releaseWindow = window as typeof window & {
      __XRIFT_RELEASE_E2E__?: BrowserReleaseE2EState;
    };
    return releaseWindow.__XRIFT_RELEASE_E2E__ ?? null;
  });
}

async function openReleaseApp(
  page: Page,
  scenario: "ready" | "setup" = "ready",
): Promise<void> {
  await page.goto(`/e2e.html?scenario=${scenario}`);
}

async function openProjectLibrary(page: Page): Promise<void> {
  await openReleaseApp(page);
  await expect(
    page.getByRole("heading", { name: "プロジェクト" }),
  ).toBeVisible();
}

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  const state = await releaseE2EState(page);
  expect(
    state?.uploadAttempts ?? [],
    "E2EはXRiftへのアップロードを開始してはいけません",
  ).toEqual([]);
  expect(
    state?.unhandledCommands ?? [],
    "E2E mockに未定義のTauri IPCがあります",
  ).toEqual([]);
});

test("初回セットアップからプロジェクト一覧へ進める", async ({ page }) => {
  await openReleaseApp(page, "setup");

  await expect(
    page.getByRole("heading", { name: /XRift Studio へようこそ/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "セットアップを開始" }).click();
  await expect(
    page.getByRole("heading", { name: "プロジェクト" }),
  ).toBeVisible();

  const state = await releaseE2EState(page);
  expect(state?.calls.some((call) => call.command === "setup_runtime")).toBe(
    true,
  );
});

const creationCases = [
  {
    title: "クラシックワールド",
    choice: "ワールドをコードで作る",
    name: "release-classic-world",
    visual: false,
  },
  {
    title: "クラシックアイテム",
    choice: "アイテムをコードで作る",
    name: "release-classic-item",
    visual: false,
  },
  {
    title: "ビジュアルワールド",
    choice: "ワールドをビジュアルで作る",
    name: "release-visual-world",
    visual: true,
    blankStarter: true,
  },
  {
    title: "ビジュアルアイテム",
    choice: "アイテムをビジュアルで作る",
    name: "release-visual-item",
    visual: true,
  },
] as const;

for (const creationCase of creationCases) {
  test(`${creationCase.title}を作成して編集画面まで開ける`, async ({ page }) => {
    await openProjectLibrary(page);
    await page.getByRole("button", { name: /新規プロジェクト/ }).click();
    await page
      .getByRole("button", { name: new RegExp(creationCase.choice) })
      .click();

    if ("blankStarter" in creationCase && creationCase.blankStarter) {
      await page.getByRole("radio", { name: /Blank/ }).click();
    }

    await page.getByLabel("プロジェクト名").fill(creationCase.name);
    await page.getByRole("button", { name: "作成して開く" }).click();

    if (creationCase.visual) {
      await expect(page.getByText("ビジュアル編集")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "XRiftへ公開", exact: true }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("button", { name: "実行", exact: true }),
      ).toBeVisible();
      await expect(page.getByText(creationCase.name, { exact: true })).toBeVisible();
    }
  });
}

test("クラシックワールドを編集・保存・実行し、公開前確認で停止する", async ({
  page,
}) => {
  await openProjectLibrary(page);

  const search = page.getByPlaceholder("プロジェクトを検索…");
  await search.fill("classic-world");
  await expect(page.getByText("E2E Classic World", { exact: true })).toBeVisible();
  await expect(page.getByText("E2E Classic Item", { exact: true })).toBeHidden();
  await search.fill("");

  await page.getByTitle("E2E Classic Worldを開く").click();
  const titleInput = page.getByPlaceholder("My XR World");
  const descriptionInput = page.getByPlaceholder(
    "どんなワールドか簡単に説明しましょう",
  );
  await expect(titleInput).toBeVisible();
  await titleInput.fill("Release Ready World");
  await descriptionInput.fill("リリース前E2Eで編集したワールドです");
  await page
    .getByRole("button", { name: "保存 (⌘/Ctrl+S)", exact: true })
    .click();
  await expect(page.getByText("ワールド設定を保存しました")).toBeVisible();

  await page.getByRole("button", { name: "実行", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "停止", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("http://localhost:4173/")).toBeVisible();
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "実行", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "アップロード" }).click();
  await expect(page.getByText("公開前の準備", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "サムネイルを設定" }),
  ).toBeVisible();

  const state = await releaseE2EState(page);
  expect(state?.shellCommands.some((command) => command.includes("run dev"))).toBe(
    true,
  );
});

test("クラシックアイテムのセキュリティチェックを完了できる", async ({
  page,
}) => {
  await openProjectLibrary(page);
  await page.getByTitle("E2E Classic Itemを開く").click();

  await page.getByRole("button", { name: "チェック", exact: true }).click();
  await expect(
    page.getByText("アイテムのセキュリティチェックに通過しました"),
  ).toBeVisible();

  const state = await releaseE2EState(page);
  expect(
    state?.shellCommands.some(
      (command) => command.includes("check") && command.includes("item"),
    ),
  ).toBe(true);
});

test("ビジュアルワールドを編集・Playし、公開確認で送信前に停止する", async ({
  page,
}) => {
  await openProjectLibrary(page);
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page
    .getByRole("button", { name: /ワールドをビジュアルで作る/ })
    .click();
  await page.getByRole("radio", { name: /Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("release-visual-flow");
  await page.getByRole("button", { name: "作成して開く" }).click();

  await expect(page.getByText("ビジュアル編集")).toBeVisible();
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: /Empty Entity/ }).click();
  await expect(
    page
      .getByRole("tree", { name: "SceneのEntity階層" })
      .getByText("Empty Entity", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('header [role="status"]').first()).toContainText(
    "保存済み",
  );
  await expect
    .poll(async () => {
      const state = await releaseE2EState(page);
      return (
        state?.calls.filter((call) => call.command === "save_visual_project")
          .length ?? 0
      );
    })
    .toBeGreaterThan(0);

  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "停止", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "XRiftへ公開", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ワールドを公開" }),
  ).toBeVisible();
  const publishDialog = page.getByRole("dialog", { name: "ワールドを公開" });
  await expect(
    publishDialog.getByText("公開用サムネイル", { exact: true }),
  ).toBeVisible();
  await expect(
    publishDialog.getByRole("button", { name: "XRiftへ公開", exact: true }),
  ).toBeDisabled();
});

test("ビジュアル編集の一時保存失敗は自動再試行で復帰する", async ({
  page,
}) => {
  await page.goto("/e2e.html?scenario=ready&saveFailures=3");
  await expect(
    page.getByRole("heading", { name: "プロジェクト" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page
    .getByRole("button", { name: /ワールドをビジュアルで作る/ })
    .click();
  await page.getByRole("radio", { name: /Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("release-save-retry");
  await page.getByRole("button", { name: "作成して開く" }).click();

  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: /Empty Entity/ }).click();

  const header = page.locator("header");
  await expect(header.getByText("保存エラー", { exact: true })).toHaveCount(0);
  await expect(header.locator('[role="status"]').first()).toContainText(
    "保存済み",
  );
  await expect
    .poll(async () => {
      const state = await releaseE2EState(page);
      return (
        state?.calls.filter((call) => call.command === "save_visual_project")
          .length ?? 0
      );
    })
    .toBe(4);
});
