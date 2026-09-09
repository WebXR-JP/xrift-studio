import { expect, test } from "@playwright/test";

test("後から読み込んだギミックGLBに照準が反応しクリックできる", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/e2e.html?scenario=ready");
  const call = (method: "mount" | "load" | "read" | "disable" | "enable" | "remove") => page.evaluate(async method => {
    const url = "/e2e/interactable-model.fixture.tsx";
    return (await import(/* @vite-ignore */ url))[method]();
  }, method);
  await call("mount");
  await expect.poll(async () => (await call("read")).registered).toBe(1);
  await expect.poll(async () => (await call("read")).aimed).toBe(false);
  await call("load");
  await expect.poll(async () => (await call("read")).aimed).toBe(true);
  await page.locator("canvas").click();
  await expect.poll(async () => (await call("read")).presses).toBe(1);
  await page.screenshot({ path: "test-results/interactable-model.png" });
  await call("disable");
  await expect.poll(async () => (await call("read")).aimed).toBe(false);
  await page.locator("canvas").click();
  expect((await call("read")).presses).toBe(1);
  await call("remove");
  await call("enable");
  await expect.poll(async () => (await call("read")).aimed).toBe(false);
  await call("load");
  await expect.poll(async () => (await call("read")).aimed).toBe(true);
  await page.locator("canvas").click();
  await expect.poll(async () => (await call("read")).presses).toBe(2);
  expect(errors).toEqual([]);
});
