import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { CitizenCloneControl } from "../src/release-e2e/citizen-clone.fixture";

declare global {
  interface Window { __CITIZEN_CLONE__?: { control: CitizenCloneControl; cleanup: () => void } }
}

test("real citizen keeps every leg joint and deformed vertex after rerenders", async ({ page }) => {
  const asset = process.env.XRIFT_CITIZEN_TEST_GLB;
  test.skip(!asset, "Set XRIFT_CITIZEN_TEST_GLB to a local citizen GLB for real-asset verification");
  const base64 = readFileSync(asset!).toString("base64");
  await page.goto("/e2e.html?scenario=ready");
  for (const legacy of [true, false]) {
    await page.evaluate(async ({ base64, legacy }) => {
      const path = "/src/release-e2e/citizen-clone.fixture.tsx";
      window.__CITIZEN_CLONE__ = await (await import(/* @vite-ignore */ path)).mountCitizenClone(base64, legacy);
    }, { base64, legacy });
    const snapshot = () => page.evaluate(() => window.__CITIZEN_CLONE__!.control.snapshot!);
    await expect.poll(async () => (await snapshot())?.skins ?? 0).toBeGreaterThan(0);
    const before = await snapshot();
    expect(before.detachedBones).toBe(0);
    for (let tick = 1; tick <= 3; tick++) {
      await page.evaluate(() => window.__CITIZEN_CLONE__!.control.rerender());
      await expect.poll(async () => (await snapshot()).tick).toBe(tick);
    }
    const after = await snapshot();
    const errors = after.vertices.map((vertex, index) => Math.hypot(
      vertex[0] - before.vertices[index][0] - .6,
      vertex[1] - before.vertices[index][1] - .3,
      vertex[2] - before.vertices[index][2],
    ));
    if (legacy) {
      expect(after.detachedBones).toBeGreaterThan(0);
      expect(Math.max(...errors)).toBeGreaterThan(.1);
    }
    else {
      expect(after.detachedBones).toBe(0);
      expect(Math.max(...errors)).toBeLessThan(1e-5);
    }
    await page.screenshot({ path: test.info().outputPath(legacy ? "citizen-before-fix.png" : "citizen-after-fix.png") });
    await test.info().attach(legacy ? "legacy-joints" : "fixed-joints", {
      body: JSON.stringify({ skins: after.skins, detachedBones: after.detachedBones, checkedVertices: after.vertices.length, maxPositionError: Math.max(...errors) }),
      contentType: "application/json",
    });
    await page.evaluate(() => window.__CITIZEN_CLONE__!.cleanup());
  }
});
