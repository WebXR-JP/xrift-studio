import { expect, test } from "@playwright/test";

for (const staticEvents of [false, true]) test(`${staticEvents ? "サムネイル" : "Scene"}のCanvas初期化の完了前に閉じてもイベントを接続せず終了できる`, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/e2e.html?canvas-lifecycle", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
  await page.goto("/e2e.html?canvas-lifecycle");
  const result = await page.evaluate(async staticEvents => {
    const path = "/e2e/canvas-event-lifecycle.fixture.tsx";
    const { runCanvasEventTeardownRace } = await import(/* @vite-ignore */ path);
    return runCanvasEventTeardownRace(true, staticEvents);
  }, staticEvents);
  expect(errors).toEqual([]);
  expect(result).toEqual({ rendererCreated: true, detached: true, active: false, connected: false, registeredRoot: false, automaticContextLoss: true });
});

test("接続中のCanvasでは既存のR3Fクリック操作を維持する", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/e2e.html?canvas-lifecycle", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
  await page.goto("/e2e.html?canvas-lifecycle");
  await page.evaluate(async () => {
    const path = "/e2e/canvas-event-lifecycle.fixture.tsx";
    const { mountCanvasPointerFixture } = await import(/* @vite-ignore */ path);
    await mountCanvasPointerFixture();
  });
  await page.locator("#canvas-pointer-fixture canvas").click();
  const pointerCount = await page.evaluate(async () => {
    const path = "/e2e/canvas-event-lifecycle.fixture.tsx";
    const fixture = await import(/* @vite-ignore */ path);
    const count = fixture.readCanvasPointerCount();
    fixture.unmountCanvasPointerFixture();
    return count;
  });
  expect(pointerCount).toBe(1);
  expect(errors).toEqual([]);
});
