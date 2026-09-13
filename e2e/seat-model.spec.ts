import { expect, test } from "@playwright/test";

for (const original of [true, false]) {
  test(original ? "公式Seatの遅延GLBで照準判定の欠落を再現する" : "Vehicleの座席は遅延GLB・差し替え後もインタラクトできる", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`/e2e.html?scenario=ready&originalSeat=${original}`);
    const call = (method: "mount" | "load" | "read" | "disable" | "enable" | "remove") => page.evaluate(async method => {
      const url = "/e2e/seat-model.fixture.tsx";
      return (await import(/* @vite-ignore */ url))[method]();
    }, method);
    await call("mount");
    await expect.poll(async () => (await call("read")).registered).toBe(1);
    await expect.poll(async () => (await call("read")).driverRegistered).toBe(true);
    await call("load");
    if (original) {
      await page.waitForTimeout(500);
      expect((await call("read")).aimed).toBe(false);
      await page.locator("canvas").click();
      expect((await call("read")).presses).toBe(0);
    } else {
      await expect.poll(async () => (await call("read")).aimed).toBe(true);
      await page.locator("canvas").click();
      await expect.poll(async () => (await call("read")).presses).toBe(1);
      await call("disable");
      await expect.poll(async () => (await call("read")).aimed).toBe(false);
      await page.locator("canvas").click();
      expect((await call("read")).presses).toBe(1);
      await call("remove"); await call("enable");
      await expect.poll(async () => (await call("read")).aimed).toBe(false);
      await call("load");
      await expect.poll(async () => (await call("read")).aimed).toBe(true);
      await page.locator("canvas").click();
      await expect.poll(async () => (await call("read")).presses).toBe(2);
    }
    expect(errors).toEqual([]);
  });
}
