import { expect, test, type Page } from "@playwright/test";
import type { operateJevWorldWorkflowFixture, readJevWorldWorkflowFixture } from "./jev-world-workflow.fixture";

type Action = Parameters<typeof operateJevWorldWorkflowFixture>[0];
type Snapshot = ReturnType<typeof readJevWorldWorkflowFixture>;

async function operate(page: Page, action: Action) {
  await page.evaluate(async (nextAction) => {
    const path = "/e2e/jev-world-workflow.fixture.tsx";
    const fixture = await import(/* @vite-ignore */ path);
    fixture.operateJevWorldWorkflowFixture(nextAction);
  }, action);
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(async () => {
    const path = "/e2e/jev-world-workflow.fixture.tsx";
    return (await import(/* @vite-ignore */ path)).readJevWorldWorkflowFixture();
  });
}

test.describe("Jev workflow fixture (mocked API; real staged construction)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e.html?scenario=ready");
    await page.evaluate(async () => {
      const path = "/e2e/jev-world-workflow.fixture.tsx";
      (await import(/* @vite-ignore */ path)).mountJevWorldWorkflowFixture();
    });
    await expect(page.locator("#jev-world-workflow-fixture")).toHaveAttribute("data-ready", "true");
  });

  test("duplicate start makes one API request; real world commits once and Undo restores the entire source", async ({ page }) => {
    await operate(page, "duplicate");
    await expect.poll(async () => (await snapshot(page)).calls).toBe(1);
    expect(await snapshot(page)).toMatchObject({ commits: 0, locked: true, sceneUnchanged: true, assetsUnchanged: true });
    await operate(page, "resolve");
    await expect.poll(async () => (await snapshot(page)).phase).toBe("done");
    const created = await snapshot(page);
    expect(created).toMatchObject({ calls: 1, commits: 1, historyEntries: 1, locked: false, existingEntitiesPreserved: true, terrainCreated: true });
    expect(created.addedEntities).toBeGreaterThanOrEqual(3);
    expect(created.addedAssets).toBeGreaterThan(0);
    expect(created.request?.state).toMatchObject({ request: "木を置かず、歩ける小さな草原を作って" });
    await operate(page, "undo");
    expect(await snapshot(page)).toMatchObject({ historyEntries: 0, restoredSource: true, sceneUnchanged: true, assetsUnchanged: true });
  });

  test("API failure releases the import lock without changing Scene or Assets", async ({ page }) => {
    await operate(page, "begin");
    await operate(page, "reject");
    await expect.poll(async () => (await snapshot(page)).phase).toBe("error");
    expect(await snapshot(page)).toMatchObject({ calls: 1, commits: 0, historyEntries: 0, locked: false, restoredSource: true });
  });

  for (const action of ["stale-scene", "stale-assets", "stale-after-stage"] as const) {
    test(`${action} preserves the concurrent edit and prevents the staged result from committing`, async ({ page }) => {
      await operate(page, "begin");
      await operate(page, action);
      await expect.poll(async () => (await snapshot(page)).phase).toBe("error");
      const result = await snapshot(page);
      expect(result).toMatchObject({ calls: 1, commits: 0, historyEntries: 0, locked: false, terrainCreated: false });
      expect(result.message).toContain("変更されました");
      expect(result.restoredSource).toBe(false);
      if (action === "stale-assets") expect(result.sceneUnchanged).toBe(true);
      else expect(result.assetsUnchanged).toBe(true);
    });
  }

  test("unmount never commits a late result and releases only when the request finishes", async ({ page }) => {
    await operate(page, "begin");
    await operate(page, "unmount");
    expect(await snapshot(page)).toMatchObject({ commits: 0, locked: true });
    await operate(page, "resolve");
    await expect.poll(async () => (await snapshot(page)).locked).toBe(false);
    expect(await snapshot(page)).toMatchObject({ commits: 0, restoredSource: true, historyEntries: 0 });
  });

  test("switching projects resets the draft and never applies the previous project's late response", async ({ page }) => {
    await operate(page, "begin");
    await expect.poll(async () => (await snapshot(page)).prompt).toContain("草原");
    await operate(page, "switch-project");
    await expect.poll(async () => (await snapshot(page)).phase).toBe("idle");
    expect(await snapshot(page)).toMatchObject({ prompt: "", commits: 0, locked: true });
    await operate(page, "resolve");
    await expect.poll(async () => (await snapshot(page)).locked).toBe(false);
    expect(await snapshot(page)).toMatchObject({ phase: "idle", prompt: "", commits: 0, historyEntries: 0, terrainCreated: false });
  });
});
