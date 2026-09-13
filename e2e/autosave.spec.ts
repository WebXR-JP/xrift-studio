import { expect, test } from "@playwright/test";
for (const kind of ["shader", "script"]) {
  test(`${kind}: autosave preserves edits during a write and retries failures`, async ({ page }) => {
    await page.route("**/autosave-harness.html*", route => route.fulfill({ contentType: "text/html", body: '<script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script><div id="root" style="height:100vh;display:flex;flex-direction:column"></div><script type="module" src="/e2e/autosave-harness.tsx"></script>' }));
    await page.goto(`/autosave-harness.html?${kind}`);
    const input = page.locator(".monaco-editor textarea").first();
    await expect(input).toBeVisible();
    await page.locator(".monaco-editor .view-lines").first().click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText(" first");
    await expect(page.getByTestId("started")).toHaveText("1");
    await page.keyboard.insertText(" second");
    await expect(page.getByTestId("saved")).toHaveText("// initial first second");
    await expect(page.getByRole("button", { name: "保存済み", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "toggle failure" }).click();
    await page.locator(".monaco-editor .view-lines").first().click(); await page.keyboard.press("ControlOrMeta+End"); await page.keyboard.insertText(" retained");
    await expect(page.getByText("test save failure", { exact: true })).toBeVisible();
    await expect(page.getByTestId("saved")).toHaveText("// initial first second");
    await page.getByRole("button", { name: "toggle failure" }).click();
    await page.getByRole("button", { name: "自動保存を再試行" }).click();
    await expect(page.getByTestId("saved")).toHaveText("// initial first second retained");
    await page.locator(".monaco-editor .view-lines").first().click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText(" close");
    await page.getByRole("button", { name: kind === "script" ? "スクリプトエディターを閉じる" : "GLSLエディターを閉じる" }).click();
    await expect(page.getByTestId("closed")).toHaveText("true");
    await expect(page.getByTestId("saved")).toHaveText("// initial first second retained close");
  });
}
