import { expect, test } from "@playwright/test";

test("saved Scripts start and update without approval, while broken updates preserve the last module", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async (url) => {
    const fixture = await import(url) as typeof import("./script-execution.fixture");
    fixture.mountScriptExecutionFixture();
  }, "/e2e/script-execution.fixture.tsx");
  await page.getByRole("button", {name:"Compile saved Script"}).click();
  await expect(page.getByTestId("runtime-status")).toHaveText("ready");
  await expect(page.getByTestId("runtime-name")).toHaveText("Version one");
  await expect(page.getByTestId("runtime-trust")).toHaveText("not-required");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.getByRole("button", {name:"Update Script"}).click();
  await expect(page.getByTestId("runtime-name")).toHaveText("Version two");
  await page.getByRole("button", {name:"Break Script"}).click();
  await expect(page.getByTestId("runtime-status")).toHaveText("error");
  await expect(page.getByTestId("runtime-errors")).not.toBeEmpty();
  await expect(page.getByTestId("runtime-name")).toHaveText("Version two");
});
