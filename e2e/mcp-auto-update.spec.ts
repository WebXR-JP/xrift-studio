import { expect, test, type Page } from "@playwright/test";
import type { XriftMcpClientId, XriftMcpClientStatus } from "../src/lib/tauri";

type UpdateFixture = {
  clients: XriftMcpClientStatus[];
  detections: number;
  updates: XriftMcpClientId[];
  failuresRemaining: number;
  holdUpdates: boolean;
  releaseUpdate?: () => void;
};
declare global {
  interface Window { __XRIFT_MCP_UPDATE_FIXTURE__?: UpdateFixture }
}

async function ready(page: Page, surface: "editor" | "library", failuresRemaining = 0) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  if (surface === "editor") {
    await page.getByRole("button", { name: /新規プロジェクト/ }).click();
    await page.getByRole("button", { name: /ワールドをビジュアルで作る/ }).click();
    await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
    await page.getByLabel("プロジェクト名").fill("mcp-update-isolated-fixture");
    await page.getByRole("button", { name: "作成して開く" }).click();
    await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toBeVisible();
    await page.getByRole("button", { name: "ChatGPTを開く", exact: true }).click();
  }
  // Only native MCP detection/registration is replaced. No real user config or server binary is touched.
  await page.evaluate(({ failuresRemaining }) => {
    const fixture: UpdateFixture = {
      detections: 0, updates: [], failuresRemaining, holdUpdates: false,
      clients: [
        { id: "codex", label: "Codex", installed: true, registered: true, needsUpdate: true, autoUpdateAllowed: true, message: "MCPサーバーを更新できます" },
        { id: "claude-code", label: "Claude Code", installed: true, registered: true, needsUpdate: false, autoUpdateAllowed: true, message: "登録済み" },
        { id: "cursor", label: "Cursor", installed: true, registered: false, needsUpdate: false, autoUpdateAllowed: true, message: "登録できます" },
        { id: "opencode", label: "OpenCode", installed: true, registered: true, needsUpdate: true, autoUpdateAllowed: false, message: "無効にしている接続" },
      ],
    };
    window.__XRIFT_MCP_UPDATE_FIXTURE__ = fixture;
    const internals = window.__TAURI_INTERNALS__!;
    const invoke = internals.invoke!.bind(internals);
    internals.invoke = async (command, args, options) => {
      if (command === "detect_xrift_mcp_clients") {
        fixture.detections++;
        return structuredClone(fixture.clients);
      }
      if (command === "register_xrift_mcp_client") {
        const clientId = args?.clientId as XriftMcpClientId;
        fixture.updates.push(clientId);
        if (fixture.holdUpdates) await new Promise<void>(resolve => { fixture.releaseUpdate = resolve; });
        if (fixture.failuresRemaining > 0) {
          fixture.failuresRemaining--;
          throw new Error("設定ファイルを保存できませんでした（隔離fixture）");
        }
        const client = fixture.clients.find(item => item.id === clientId)!;
        Object.assign(client, { registered: true, needsUpdate: false, message: "更新しました" });
        return structuredClone(client);
      }
      return invoke(command, args, options);
    };
  }, { failuresRemaining });
}

async function openSettings(page: Page, surface: "editor" | "library") {
  if (surface === "library") {
    await page.getByRole("button", { name: "設定", exact: true }).click();
    await page.getByRole("dialog", { name: "XRift Studio", exact: true }).getByRole("button", { name: "MCP接続を開く", exact: true }).click();
  } else {
    await page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true }).getByRole("button", { name: "MCP接続", exact: true }).click();
  }
  const dialog = page.getByRole("dialog", { name: "MCP接続", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const fixture = window.__XRIFT_MCP_UPDATE_FIXTURE__!;
    return { detections: fixture.detections, updates: fixture.updates, clients: fixture.clients };
  });
}

for (const surface of ["editor", "library"] as const) {
  test(`${surface}: MCP接続を開くと登録済みの旧サーバーだけ自動更新し、再表示でも再確認する`, async ({ page }, testInfo) => {
    await ready(page, surface);
    await page.evaluate(() => { window.__XRIFT_MCP_UPDATE_FIXTURE__!.holdUpdates = true; });
    const dialog = await openSettings(page, surface);
    await expect(dialog.getByText("MCPサーバーを自動更新中", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "更新中", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "登録", exact: true })).toBeDisabled();
    if (surface === "library") {
      await dialog.getByRole("button", { name: "MCP接続を閉じる", exact: true }).click();
      await openSettings(page, surface);
      await expect(dialog.getByText("MCPサーバーを自動更新中", { exact: true })).toBeVisible();
      expect((await snapshot(page)).updates).toEqual(["codex"]);
      expect((await snapshot(page)).detections).toBe(1);
    }
    await page.evaluate(() => {
      const fixture = window.__XRIFT_MCP_UPDATE_FIXTURE__!;
      fixture.holdUpdates = false;
      fixture.releaseUpdate!();
    });
    await expect(dialog.getByText("MCPサーバーを更新しました。AIクライアントを再起動するか、MCPを再読み込みしてください。", { exact: true })).toBeVisible();
    await expect.poll(async () => (await snapshot(page)).updates).toEqual(["codex"]);
    await expect(dialog.getByRole("button", { name: "登録済み", exact: true })).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath("mcp-auto-update.png") });
    const before = await snapshot(page);
    expect(before.clients.find(client => client.id === "cursor")?.registered).toBe(false);
    expect(before.clients.find(client => client.id === "opencode")?.autoUpdateAllowed).toBe(false);
    await dialog.getByRole("button", { name: "MCP接続を閉じる", exact: true }).click();
    await openSettings(page, surface);
    await expect.poll(async () => (await snapshot(page)).detections).toBeGreaterThan(before.detections);
    await expect(dialog.getByRole("button", { name: "AIクライアントを再検出", exact: true })).toBeEnabled();
    expect((await snapshot(page)).updates).toEqual(["codex"]);
  });

  test(`${surface}: MCPサーバーの自動更新に失敗しても手動更新で再試行できる`, async ({ page }) => {
    await ready(page, surface, 1);
    const dialog = await openSettings(page, surface);
    await expect(dialog.getByRole("alert")).toContainText("CodexのMCPサーバーを自動更新できませんでした");
    const codex = dialog.getByText("Codex", { exact: true }).locator("../..");
    await expect(codex.getByRole("button", { name: "更新", exact: true })).toBeEnabled();
    if (surface === "library") await page.evaluate(() => { window.__XRIFT_MCP_UPDATE_FIXTURE__!.holdUpdates = true; });
    await codex.getByRole("button", { name: "更新", exact: true }).click();
    if (surface === "library") {
      await expect(codex.getByRole("button", { name: "更新中", exact: true })).toBeDisabled();
      await dialog.getByRole("button", { name: "MCP接続を閉じる", exact: true }).click();
      await openSettings(page, surface);
      await expect(dialog.getByText("MCPサーバーを自動更新中", { exact: true })).toBeVisible();
      expect((await snapshot(page)).updates).toEqual(["codex", "codex"]);
      await page.evaluate(() => {
        const fixture = window.__XRIFT_MCP_UPDATE_FIXTURE__!;
        fixture.holdUpdates = false;
        fixture.releaseUpdate!();
      });
    }
    await expect(codex.getByRole("button", { name: "登録済み", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    expect((await snapshot(page)).updates).toEqual(["codex", "codex"]);
    await dialog.getByRole("button", { name: "MCP接続を閉じる", exact: true }).click();
    await openSettings(page, surface);
    await expect(dialog.getByRole("button", { name: "AIクライアントを再検出", exact: true })).toBeEnabled();
    expect((await snapshot(page)).updates).toEqual(["codex", "codex"]);
  });
}
